/**
 * FeeDistributor — LOCKED dual-wallet 70/30 split
 *
 * PLATFORM_WALLET (70%): ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
 * DEV_WALLET      (30%): 35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr
 *
 * These addresses are HARDCODED and cannot be changed via env vars.
 * Per HUKUM 7: every split event is logged to audit trail.
 */

import { AuditLogger, AuditEventType } from './auditLogger';

// ── LOCKED WALLET ADDRESSES (cannot be changed via env) ───────────────────────
export const LOCKED_PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
export const LOCKED_DEV_WALLET      = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';
export const PLATFORM_SPLIT_PCT     = 70;
export const DEV_SPLIT_PCT          = 30;
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeSplitResult {
    totalFeeIdr:     number;
    platformShareIdr: number;
    devShareIdr:     number;
    platformWallet:  string;
    devWallet:       string;
    splitPct:        string;
}

/**
 * Calculate the 70/30 split for a given platform fee.
 * Rounds down on platform share, dev gets the remainder (avoids over-splitting).
 */
export function calculateFeeSplit(totalFeeIdr: number): FeeSplitResult {
    const platformShare = Math.floor(totalFeeIdr * PLATFORM_SPLIT_PCT / 100);
    const devShare      = totalFeeIdr - platformShare;

    return {
        totalFeeIdr,
        platformShareIdr: platformShare,
        devShareIdr:      devShare,
        platformWallet:   LOCKED_PLATFORM_WALLET,
        devWallet:        LOCKED_DEV_WALLET,
        splitPct:         `${PLATFORM_SPLIT_PCT}/${DEV_SPLIT_PCT}`,
    };
}

/**
 * Log the fee split event to the immutable audit trail.
 * Called after every on-chain confirmed transaction.
 */
export function logFeeSplit(
    intentId:    string,
    txSignature: string,
    feeIdr:      number,
): FeeSplitResult {
    const split = calculateFeeSplit(feeIdr);

    AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, {
        event:           'FEE_SPLIT_RECORDED',
        intentId,
        txSignature,
        totalFeeIdr:     split.totalFeeIdr,
        platformWallet:  split.platformWallet,
        platformShare:   split.platformShareIdr,
        devWallet:       split.devWallet,
        devShare:        split.devShareIdr,
        splitPct:        split.splitPct,
        note:            'On-chain: Jupiter platformFeeBps=50 → PLATFORM_WALLET ATA. Off-chain: dev 30% accrued.',
        timestamp:       new Date().toISOString(),
    });

    console.log(
        `[FEE_SPLIT] Rp${feeIdr} → Platform(70%)=Rp${split.platformShareIdr} | Dev(30%)=Rp${split.devShareIdr}`
    );

    return split;
}
