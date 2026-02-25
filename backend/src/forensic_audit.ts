
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const TREASURY_WALLET = new PublicKey('ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m');
const IDRX_MINT = new PublicKey('idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur');

async function audit() {
    console.log(`[FORENSIC] Auditing Treasury Wallet: ${TREASURY_WALLET.toBase58()}`);

    // 1. Get SOL Balance
    const solBalance = await connection.getBalance(TREASURY_WALLET);
    console.log(`[SOL] Balance: ${solBalance / 1e9} SOL`);

    // 2. Get IDRX Balance
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(TREASURY_WALLET, { mint: IDRX_MINT });
    if (tokenAccounts.value.length === 0) {
        console.log('[IDRX] No IDRX account found for treasury.');
    } else {
        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        console.log(`[IDRX] Balance: ${balance} IDRX`);
    }

    // 3. Get Recent Transactions
    console.log('[FORENSIC] Fetching last 10 transactions...');
    const signatures = await connection.getSignaturesForAddress(TREASURY_WALLET, { limit: 10 });
    for (const sig of signatures) {
        console.log(`${sig.signature} | ${new Date((sig.blockTime || 0) * 1000).toISOString()} | Err: ${sig.err}`);
    }
}

audit().catch(console.error);
