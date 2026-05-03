/**
 * SOLQ Hot Wallet Monitor
 * 
 * Monitors the gas sponsorship hot wallet balance every 15 minutes.
 * Per spec: thresholds at 1.0 SOL (warning) and 0.1 SOL (critical).
 * If balance drops below 0.1 SOL: PAUSE all new transactions immediately.
 * 
 * This is a CRITICAL SERVICE that prevents service degradation due to insufficient gas.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AuditLogger, AuditEventType } from './auditLogger';

export class HotWalletMonitor {
    private static instance: HotWalletMonitor;
    private isRunning = false;
    private lastCheckAt: Date | null = null;
    private lastBalance: number = 0;

    // Thresholds per spec
    private readonly CRITICAL_THRESHOLD_SOL = 0.1;
    private readonly WARNING_THRESHOLD_SOL = 1.0;
    private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
    private readonly HELIUS_RPC = process.env.HELIUS_RPC_URL;
    private readonly HOT_WALLET_ADDRESS = process.env.GAS_HOT_WALLET_PUBLIC_KEY;

    private connection: Connection | null = null;
    private statusCache: {
        lastBalance: number;
        lastCheckAt: Date;
        level: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
    } = {
        lastBalance: 0,
        lastCheckAt: new Date(),
        level: 'UNKNOWN'
    };

    private constructor() {}

    public static getInstance(): HotWalletMonitor {
        if (!HotWalletMonitor.instance) {
            HotWalletMonitor.instance = new HotWalletMonitor();
        }
        return HotWalletMonitor.instance;
    }

    /**
     * Start monitoring the hot wallet
     * Should be called during service startup
     */
    public start(): void {
        if (this.isRunning) {
            console.warn('[HOT-WALLET] Monitor already running');
            return;
        }

        if (!this.HELIUS_RPC) {
            console.error('[HOT-WALLET] HELIUS_RPC_URL not configured. Cannot start monitor.');
            return;
        }

        if (!this.HOT_WALLET_ADDRESS) {
            console.error('[HOT-WALLET] GAS_HOT_WALLET_PUBLIC_KEY not configured. Cannot start monitor.');
            return;
        }

        this.connection = new Connection(this.HELIUS_RPC, 'confirmed');
        this.isRunning = true;

        console.log('[HOT-WALLET] Monitor started. Check interval: 15 minutes');
        console.log(`[HOT-WALLET] Monitoring address: ${this.HOT_WALLET_ADDRESS}`);

        // Run first check immediately
        this.checkBalance().catch(err => {
            console.error('[HOT-WALLET] Initial check failed:', err.message);
        });

        // Then run every 15 minutes
        setInterval(() => {
            this.checkBalance().catch(err => {
                console.error('[HOT-WALLET] Monitor check failed:', err.message);
            });
        }, this.CHECK_INTERVAL_MS);
    }

    /**
     * Perform balance check
     */
    private async checkBalance(): Promise<void> {
        if (!this.connection || !this.HOT_WALLET_ADDRESS) {
            throw new Error('Hot wallet monitor not properly initialized');
        }

        try {
            const publicKey = new PublicKey(this.HOT_WALLET_ADDRESS);
            const balanceLamports = await this.connection.getBalance(publicKey);
            const balanceSOL = balanceLamports / 1_000_000_000;

            this.lastCheckAt = new Date();
            this.lastBalance = balanceSOL;

            // Determine alert level
            let level: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
            if (balanceSOL < this.CRITICAL_THRESHOLD_SOL) {
                level = 'CRITICAL';
            } else if (balanceSOL < this.WARNING_THRESHOLD_SOL) {
                level = 'WARNING';
            }

            this.statusCache = {
                lastBalance: balanceSOL,
                lastCheckAt: this.lastCheckAt,
                level
            };

            // Log appropriately
            if (level === 'CRITICAL') {
                console.error(`⚠️ [HOT-WALLET] CRITICAL: Balance ${balanceSOL.toFixed(4)} SOL < ${this.CRITICAL_THRESHOLD_SOL} SOL`);
                AuditLogger.log(AuditEventType.CRITICAL_LOW_GAS, {
                    balanceSOL,
                    threshold: this.CRITICAL_THRESHOLD_SOL,
                    message: 'Hot wallet balance CRITICAL. All new transactions will be PAUSED.'
                });
                // TODO: Alert ops team via Slack/Email
                // TODO: Set feature flag to pause new transactions
            } else if (level === 'WARNING') {
                console.warn(`⚠️  [HOT-WALLET] WARNING: Balance ${balanceSOL.toFixed(4)} SOL < ${this.WARNING_THRESHOLD_SOL} SOL`);
                AuditLogger.log(AuditEventType.WARNING_LOW_GAS, {
                    balanceSOL,
                    threshold: this.WARNING_THRESHOLD_SOL,
                    message: 'Hot wallet balance low. Top-up recommended soon.'
                });
                // TODO: Alert ops team
            } else {
                console.log(`✅ [HOT-WALLET] NORMAL: Balance ${balanceSOL.toFixed(4)} SOL`);
            }
        } catch (error: any) {
            console.error(`[HOT-WALLET] Check failed: ${error.message}`);
            AuditLogger.log(AuditEventType.ERROR_GAS_CHECK_FAILED, {
                error: error.message,
                rpcUrl: this.HELIUS_RPC
            });
            throw error;
        }
    }

    /**
     * Get current hot wallet status
     * Useful for dashboards and health checks
     */
    public getStatus(): {
        lastBalance: number;
        lastCheckAt: Date;
        level: string;
        isHealthy: boolean;
    } {
        return {
            lastBalance: this.statusCache.lastBalance,
            lastCheckAt: this.statusCache.lastCheckAt,
            level: this.statusCache.level,
            isHealthy: this.statusCache.level !== 'CRITICAL'
        };
    }

    /**
     * Check if hot wallet is in critical state
     * If true, ALL new transactions should be rejected
     */
    public isCritical(): boolean {
        return this.statusCache.level === 'CRITICAL';
    }

    /**
     * Stop monitoring
     */
    public stop(): void {
        this.isRunning = false;
        console.log('[HOT-WALLET] Monitor stopped');
    }
}
