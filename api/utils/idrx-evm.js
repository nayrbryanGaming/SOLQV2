// IDRX off-ramp via Polygon burn → redeem-request API.
//
// Flow:
//   1) Platform holds IDRX (ERC-20) on Polygon at the wallet whose private key
//      is in PLATFORM_EVM_PRIVATE_KEY. Wallet must be registered in the IDRX
//      dashboard as a redeem signer.
//   2) Per disbursement: contract.burnWithAccountNumber(amount, bankAccount)
//      burns IDRX from inventory and emits an event IDRX's backend ingests.
//   3) After ~3-second Polygon confirmation we POST the burn TX hash to
//      /api/transaction/redeem-request with networkChainId='137'.
//   4) IDRX disburses IDR to the merchant bank account via BI-FAST.
//
// IDRX docs confirmed Solana is NOT supported for redeem; only EVM chains
// (Polygon, Base, BSC, Lisk, Kaia, Gnosis). Probed live with our API key
// 2026-05-17 — every Solana chainId returned 'Invalid chain ID: unsupported
// chain ID'. Polygon (137) returns 'Bank not found' (chain accepted).
//
// IDRX Polygon contract: 0x649a2DA7B28E0D54c13D5eFf95d3A660652742cC
//   decimals = 0 (1 IDRX = 1 IDR raw, no fractional units)
//   burn fns: burn(uint256), burnFrom(address,uint256),
//             burnWithAccountNumber(uint256,string), burnBridge(uint256,uint256)
// We use burnWithAccountNumber so the bank account is embedded in the burn
// event, matching IDRX's "burn must happen inside the platform" expectation.

import { JsonRpcProvider, Wallet, Contract, formatUnits } from 'ethers';
import { createHmac } from 'node:crypto';

const POLYGON_RPCS = [
  'https://polygon.publicnode.com',
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
];

const IDRX_BASE = 'https://idrx.co';
const IDRX_CONTRACT = process.env.IDRX_CONTRACT_POLYGON
  || '0x649a2DA7B28E0D54c13D5eFf95d3A660652742cC';
const PLATFORM_EVM_KEY = process.env.PLATFORM_EVM_PRIVATE_KEY ?? '';
const PLATFORM_EVM_CHAIN_ID = Number(process.env.PLATFORM_EVM_CHAIN_ID ?? 137);
const IDRX_API_KEY = process.env.IDRX_API_KEY ?? '';
const IDRX_SECRET_KEY = process.env.IDRX_SECRET_KEY ?? '';

const IDRX_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function burnWithAccountNumber(uint256 amount, string memory accountNumber)',
  'function burn(uint256 amount)',
];

const BANK_CODE_MAP = {
  BCA: 'BCA', BNI: 'BNI', BRI: 'BRI', MANDIRI: 'MANDIRI',
  CIMB: 'CIMB', DANAMON: 'DANAMON', PERMATA: 'PERMATA',
  MEGA: 'MEGA', BTN: 'BTN', BTPN: 'BTPN', OCBC: 'OCBC',
  GOPAY: 'GOPAY', OVO: 'OVO', DANA: 'DANA', LINKAJA: 'LINKAJA',
  SHOPEEPAY: 'SHOPEEPAY', QRIS: 'QRIS',
};

export function mapBankCode(rawCode) {
  if (!rawCode) return null;
  return BANK_CODE_MAP[String(rawCode).toUpperCase()] ?? null;
}

let cachedProvider = null;
async function getProvider() {
  if (cachedProvider) return cachedProvider;
  let lastErr = null;
  for (const url of POLYGON_RPCS) {
    try {
      const p = new JsonRpcProvider(url, PLATFORM_EVM_CHAIN_ID, { staticNetwork: true });
      await p.getBlockNumber();
      cachedProvider = p;
      return p;
    } catch (e) { lastErr = e; }
  }
  throw new Error('All Polygon RPCs unreachable: ' + (lastErr?.message || 'unknown'));
}

export async function getInventoryStatus() {
  if (!PLATFORM_EVM_KEY) {
    return { ok: false, reason: 'NO_PLATFORM_KEY', address: null, idrxBalance: 0, maticBalance: 0 };
  }
  try {
    const provider = await getProvider();
    const wallet = new Wallet(PLATFORM_EVM_KEY, provider);
    const idrx = new Contract(IDRX_CONTRACT, IDRX_ABI, provider);
    const [idrxBal, maticBal] = await Promise.all([
      idrx.balanceOf(wallet.address),
      provider.getBalance(wallet.address),
    ]);
    return {
      ok: true,
      address: wallet.address,
      chainId: PLATFORM_EVM_CHAIN_ID,
      idrxBalance: Number(idrxBal),
      maticBalance: Number(maticBal),
      maticBalanceEth: formatUnits(maticBal, 18),
      contract: IDRX_CONTRACT,
    };
  } catch (e) {
    return { ok: false, reason: 'RPC_ERROR', error: e.message };
  }
}

function buildIdrxSignature(timestamp, method, urlPath, bodyStr) {
  const secretBytes = Buffer.from(IDRX_SECRET_KEY, 'hex');
  const message = `${timestamp}${method.toUpperCase()}${urlPath}${bodyStr}`;
  return createHmac('sha256', secretBytes).update(message).digest('base64url');
}

async function submitIdrxRedeemRequest({ burnTxHash, amountIdr, bankAccount, bankCode, bankName, bankAccountName, walletAddress }) {
  if (!IDRX_API_KEY || !IDRX_SECRET_KEY) {
    throw new Error('IDRX_API_KEY and IDRX_SECRET_KEY env vars required');
  }
  const mappedCode = mapBankCode(bankCode);
  if (!mappedCode) throw new Error(`Unsupported bank code: ${bankCode}`);

  const timestamp = String(Date.now());
  const urlPath = '/api/transaction/redeem-request';
  const body = {
    txHash: burnTxHash,
    networkChainId: String(PLATFORM_EVM_CHAIN_ID),
    amountTransfer: String(Math.round(amountIdr)),
    bankAccount: String(bankAccount),
    bankCode: mappedCode,
    bankName: bankName ?? mappedCode,
    bankAccountName: bankAccountName ?? 'Merchant',
    walletAddress: walletAddress ?? '',
  };
  const bodyStr = JSON.stringify(body);
  const signature = buildIdrxSignature(timestamp, 'POST', urlPath, bodyStr);

  const response = await fetch(`${IDRX_BASE}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idrx-api-key': IDRX_API_KEY,
      'idrx-api-sig': signature,
      'idrx-api-ts': timestamp,
    },
    body: bodyStr,
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(`IDRX redeem [${response.status}]: ${data?.message || text}`);
  }
  return data;
}

// One-shot disbursement: burn IDRX on Polygon, then submit burn hash to IDRX
// redeem-request. Returns:
//   { status: 'DISBURSED', burnTxHash, redeem }                                — success
//   { status: 'INVENTORY_EMPTY', balance, required }                          — not enough IDRX
//   { status: 'GAS_EMPTY', maticBalance }                                     — not enough MATIC for burn
//   { status: 'CONFIG_MISSING', missing: [...] }                              — env vars absent
//   { status: 'IDRX_REJECTED', error, burnTxHash }                            — burn ok but redeem-request failed
//   { status: 'RPC_ERROR', error }                                            — Polygon RPC down
// Caller decides how to surface this. Idempotency: caller should track
// per-intent disbursement_status so a retry doesn't double-burn.
export async function disburseFromInventory({
  amountIdr,
  bankCode,
  bankAccount,
  bankAccountName,
  bankName,
}) {
  const missing = [];
  if (!PLATFORM_EVM_KEY) missing.push('PLATFORM_EVM_PRIVATE_KEY');
  if (!IDRX_API_KEY) missing.push('IDRX_API_KEY');
  if (!IDRX_SECRET_KEY) missing.push('IDRX_SECRET_KEY');
  if (missing.length) return { status: 'CONFIG_MISSING', missing };

  if (!amountIdr || amountIdr < 20000) {
    return { status: 'AMOUNT_TOO_SMALL', amount: amountIdr, minimum: 20000, note: 'IDRX minimum redeem is Rp 20.000' };
  }
  if (!bankAccount || !bankCode) {
    return { status: 'MERCHANT_INCOMPLETE', missing: { bankAccount: !bankAccount, bankCode: !bankCode } };
  }

  let provider;
  try {
    provider = await getProvider();
  } catch (e) {
    return { status: 'RPC_ERROR', error: e.message };
  }

  const wallet = new Wallet(PLATFORM_EVM_KEY, provider);
  const idrx = new Contract(IDRX_CONTRACT, IDRX_ABI, wallet);
  const burnAmount = BigInt(Math.round(amountIdr)); // decimals=0 on IDRX Polygon

  let idrxBal, maticBal;
  try {
    [idrxBal, maticBal] = await Promise.all([
      idrx.balanceOf(wallet.address),
      provider.getBalance(wallet.address),
    ]);
  } catch (e) {
    return { status: 'RPC_ERROR', error: e.message };
  }

  if (idrxBal < burnAmount) {
    return {
      status: 'INVENTORY_EMPTY',
      balance: Number(idrxBal),
      required: Number(burnAmount),
      shortfall: Number(burnAmount - idrxBal),
      walletAddress: wallet.address,
      note: 'Top up IDRX on Polygon at ' + wallet.address,
    };
  }

  // Need enough MATIC for gas. burnWithAccountNumber is ~80k gas; budget 0.05 MATIC.
  const MIN_MATIC_WEI = 50_000_000_000_000_000n; // 0.05 MATIC
  if (maticBal < MIN_MATIC_WEI) {
    return {
      status: 'GAS_EMPTY',
      maticBalance: Number(maticBal),
      maticBalanceEth: formatUnits(maticBal, 18),
      minimumEth: '0.05',
      walletAddress: wallet.address,
      note: 'Top up MATIC for gas at ' + wallet.address,
    };
  }

  let burnTxHash;
  try {
    const tx = await idrx.burnWithAccountNumber(burnAmount, String(bankAccount));
    const receipt = await tx.wait(1);
    burnTxHash = receipt.hash;
  } catch (e) {
    return { status: 'BURN_FAILED', error: e.message };
  }

  try {
    const redeem = await submitIdrxRedeemRequest({
      burnTxHash,
      amountIdr,
      bankAccount,
      bankCode,
      bankName,
      bankAccountName,
      walletAddress: wallet.address,
    });
    return {
      status: 'DISBURSED',
      burnTxHash,
      burnExplorer: `https://polygonscan.com/tx/${burnTxHash}`,
      amountBurned: Number(burnAmount),
      redeem,
    };
  } catch (e) {
    // Burn already happened — IDRX rejected the redeem. Surface this so the
    // caller can flag for manual reconciliation rather than retrying.
    return {
      status: 'IDRX_REJECTED',
      burnTxHash,
      burnExplorer: `https://polygonscan.com/tx/${burnTxHash}`,
      amountBurned: Number(burnAmount),
      error: e.message,
    };
  }
}
