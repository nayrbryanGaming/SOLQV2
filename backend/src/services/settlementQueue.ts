/**
 * Settlement Queue Service — SOLQ Payment Settlement Orchestration
 *
 * Dual-track settlement per OJK APU/PPT compliance and payment speed requirements:
 *   FAST LANE:    > Rp 500.000 → immediate Xendit disbursement call
 *   EFFICIENT LANE: ≤ Rp 500.000 → accumulate per merchant, batch EOD or threshold
 *
 * Queue backed by BullMQ + Redis for durability across restarts.
 * State transitions tracked in PostgreSQL Settlement table for audit.
 *
 * Per HUKUM 6 (EXPLICIT FAILURE): all errors logged, no silent fallbacks.
 * Per HUKUM 7 (IMMUTABLE AUDIT): all state changes logged in PostgreSQL.
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { AuditLogger, AuditEventType } from './auditLogger';
import { XenditDisbursementService } from './xenditDisbursement';
import { encryptField, decryptField } from './fieldEncryption';

// ── Constants ────────────────────────────────────────────────────────────────

const FAST_LANE_THRESHOLD_IDR = 500_000;
const EFFICIENT_LANE_BATCH_THRESHOLD = 2_000_000;
const BATCH_WINDOW_MINUTES = 60;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export enum SettlementTrack {
    FAST_LANE = 'FAST_LANE',
    EFFICIENT_LANE = 'EFFICIENT_LANE',
}

export enum SettlementStatus {
    PENDING = 'PENDING',
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

export interface SettlementIntent {
    paymentIntentId: string;
    merchantNMID: string;
    merchantName: string;
    amountIDR: number;
    bankCode: string;
    accountNumber: string;
    accountHolderName: string;
    track: SettlementTrack;
    solanaTxSignature: string;
}

export interface SettlementJobData {
    paymentIntentId: string;
    merchantNMID: string;
    amountIDR: number;
    batchId?: string;
    attemptCount: number;
}

// ── Singleton Pattern ────────────────────────────────────────────────────────

let instance: SettlementQueueService | null = null;

export class SettlementQueueService {
    private prisma: PrismaClient;
    private redis: Redis;
    private fastLaneQueue: Queue<SettlementJobData>;
    private efficientLaneQueue: Queue<SettlementJobData>;
    private fastLaneWorker: Worker<SettlementJobData>;
    private efficientLaneWorker: Worker<SettlementJobData>;

    private constructor(prisma: PrismaClient, redisUrl: string) {
        this.prisma = prisma;

        this.redis = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });

        // BullMQ queues share the same Redis connection
        this.fastLaneQueue = new Queue<SettlementJobData>('settlement-fast-lane', {
            connection: this.redis,
            defaultJobOptions: {
                attempts: MAX_RETRIES,
                backoff: { type: 'exponential', delay: RETRY_DELAY_MS },
                removeOnComplete: { age: 3600 },
                removeOnFail: false,
            },
        });

        this.efficientLaneQueue = new Queue<SettlementJobData>('settlement-efficient-lane', {
            connection: this.redis,
            defaultJobOptions: {
                attempts: MAX_RETRIES,
                backoff: { type: 'exponential', delay: RETRY_DELAY_MS },
                removeOnComplete: { age: 3600 },
                removeOnFail: false,
            },
        });

        // BullMQ Workers (replaces queue.process())
        this.fastLaneWorker = new Worker<SettlementJobData>(
            'settlement-fast-lane',
            async (job: Job<SettlementJobData>) => {
                return this.processFastLaneSettlement(job.data);
            },
            { connection: this.redis }
        );

        this.efficientLaneWorker = new Worker<SettlementJobData>(
            'settlement-efficient-lane',
            async (job: Job<SettlementJobData>) => {
                return this.processEfficientLaneSettlement(job.data);
            },
            { connection: this.redis }
        );

        this.setupListeners();
    }

    static getInstance(
        prisma: PrismaClient,
        redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379'
    ): SettlementQueueService {
        if (!instance) {
            instance = new SettlementQueueService(prisma, redisUrl);
        }
        return instance;
    }

    /**
     * Enqueue a settlement payment (called after on-chain confirmation)
     */
    async enqueueSettlement(intent: SettlementIntent): Promise<void> {
        try {
            const track = intent.amountIDR > FAST_LANE_THRESHOLD_IDR
                ? SettlementTrack.FAST_LANE
                : SettlementTrack.EFFICIENT_LANE;

            const jobData: SettlementJobData = {
                paymentIntentId: intent.paymentIntentId,
                merchantNMID: intent.merchantNMID,
                amountIDR: intent.amountIDR,
                attemptCount: 0,
            };

            const queue = track === SettlementTrack.FAST_LANE
                ? this.fastLaneQueue
                : this.efficientLaneQueue;

            const job = await queue.add('settle', jobData);

            await this.prisma.settlement.create({
                data: {
                    paymentIntentId: intent.paymentIntentId,
                    amountIDR: intent.amountIDR,
                    settlementMethod: 'XENDIT',
                    settlementTrack: track,
                    bankCode: intent.bankCode,
                    accountNumber: encryptField(intent.accountNumber), // BUG-061: encrypt PII at rest
                    accountHolderName: intent.accountHolderName,
                    xenditId: null,
                    externalId: intent.paymentIntentId,
                    settlementStatus: 'PENDING',
                    attemptCount: 0,
                    reference: `SETTLEMENT_${intent.paymentIntentId}`,
                },
            });

            AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, {
                paymentIntentId: intent.paymentIntentId,
                track,
                amount: intent.amountIDR,
                jobId: job.id,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                paymentIntentId: intent.paymentIntentId,
                error: errorMsg,
                timestamp: new Date().toISOString(),
            });
            throw error;
        }
    }

    private async processFastLaneSettlement(
        jobData: SettlementJobData
    ): Promise<void> {
        const { paymentIntentId, merchantNMID, amountIDR } = jobData;

        try {
            const settlement = await this.prisma.settlement.findFirst({
                where: { paymentIntentId },
            });

            if (!settlement) {
                throw new Error(`Settlement record not found: ${paymentIntentId}`);
            }

            const xenditResponse = await this.callXenditDisbursement(
                settlement.bankCode,
                decryptField(settlement.accountNumber), // BUG-061: decrypt PII before use
                settlement.accountHolderName,
                amountIDR,
                paymentIntentId,
                merchantNMID
            );

            await this.prisma.settlement.update({
                where: { id: settlement.id },
                data: {
                    xenditId: xenditResponse.id,
                    settlementStatus: SettlementStatus.PROCESSING,
                    lastAttemptAt: new Date(),
                    attemptCount: (settlement.attemptCount || 0) + 1,
                },
            });

            AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, {
                paymentIntentId,
                xenditId: xenditResponse.id,
                amount: amountIDR,
                track: 'FAST_LANE',
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await this.recordSettlementError(paymentIntentId, errorMsg);
            throw error;
        }
    }

    private async processEfficientLaneSettlement(
        jobData: SettlementJobData
    ): Promise<void> {
        const { paymentIntentId, merchantNMID, amountIDR } = jobData;

        try {
            const recentSettlements = await this.prisma.settlement.findMany({
                where: {
                    settlementTrack: SettlementTrack.EFFICIENT_LANE,
                    createdAt: {
                        gte: new Date(Date.now() - BATCH_WINDOW_MINUTES * 60 * 1000),
                    },
                },
            });

            const merchantAccount = await this.getMerchantAccount(merchantNMID);
            const merchantTotal = recentSettlements
                .filter((s: any) => merchantAccount && s.accountNumber === merchantAccount.accountNumber)
                .reduce((sum: number, s: any) => sum + s.amountIDR, 0) + amountIDR;

            const shouldDisburse = merchantTotal >= EFFICIENT_LANE_BATCH_THRESHOLD
                || this.isNearEndOfBatchWindow();

            if (shouldDisburse) {
                const pendingSettlements = await this.prisma.settlement.findMany({
                    where: {
                        settlementTrack: SettlementTrack.EFFICIENT_LANE,
                        settlementStatus: 'PENDING',
                    },
                });

                for (const settlement of pendingSettlements) {
                    const xenditResponse = await this.callXenditDisbursement(
                        settlement.bankCode,
                        settlement.accountNumber,
                        settlement.accountHolderName,
                        settlement.amountIDR,
                        settlement.paymentIntentId,
                        merchantNMID
                    );

                    await this.prisma.settlement.update({
                        where: { id: settlement.id },
                        data: {
                            xenditId: xenditResponse.id,
                            settlementStatus: SettlementStatus.PROCESSING,
                            lastAttemptAt: new Date(),
                            attemptCount: (settlement.attemptCount || 0) + 1,
                        },
                    });
                }

                AuditLogger.log(AuditEventType.SETTLEMENT_BATCH_INITIATED, {
                    count: pendingSettlements.length,
                    totalAmount: pendingSettlements.reduce((sum: number, s: any) => sum + s.amountIDR, 0),
                    timestamp: new Date().toISOString(),
                });
            } else {
                // Re-queue for later check
                await this.efficientLaneQueue.add('settle', jobData, {
                    delay: 60 * 1000,
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await this.recordSettlementError(paymentIntentId, errorMsg);
            throw error;
        }
    }

    // BUG-058 FIX: Daily withdrawal limit — 100M IDR/day hard cap, alert at 50M.
    // Redis counter with 24-hour TTL tracks cumulative outflow.
    private async checkDailyWithdrawalLimit(amountIDR: number): Promise<void> {
        const DAILY_LIMIT_IDR = 100_000_000;
        const ALERT_THRESHOLD_IDR = 50_000_000;
        const dayKey = `solq:daily_outflow:${new Date().toISOString().slice(0, 10)}`;

        const current = parseInt(await this.redis.get(dayKey) || '0', 10);
        if (current + amountIDR > DAILY_LIMIT_IDR) {
            AuditLogger.log(AuditEventType.SECURITY_REPLAY_BLOCKED, {
                event: 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED',
                currentOutflow: current,
                attempted: amountIDR,
                limit: DAILY_LIMIT_IDR,
            });
            throw new Error(`Daily withdrawal limit exceeded (${DAILY_LIMIT_IDR.toLocaleString()} IDR/day)`);
        }
        if (current + amountIDR >= ALERT_THRESHOLD_IDR) {
            console.warn(`[Settlement] ALERT: Daily outflow at ${(current + amountIDR).toLocaleString()} IDR (threshold ${ALERT_THRESHOLD_IDR.toLocaleString()})`);
        }
        // Increment counter, set TTL = seconds until midnight
        await this.redis.incrby(dayKey, amountIDR);
        const now = new Date();
        const midnight = new Date(now.toISOString().slice(0, 10));
        midnight.setDate(midnight.getDate() + 1);
        const secondsUntilMidnight = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
        await this.redis.expire(dayKey, secondsUntilMidnight);
    }

    private async callXenditDisbursement(
        bankCode: string,
        accountNumber: string,
        accountHolderName: string,
        amountIDR: number,
        paymentIntentId: string,
        merchantNMID: string
    ): Promise<any> {
        if (!XenditDisbursementService.isValidBankCode(bankCode)) {
            throw new Error(`Invalid bank code: ${bankCode}`);
        }
        if (!XenditDisbursementService.isValidAccountNumber(accountNumber)) {
            throw new Error(`Invalid account number: ${accountNumber}`);
        }
        if (!XenditDisbursementService.isValidAmount(amountIDR)) {
            throw new Error(`Invalid amount: ${amountIDR}`);
        }
        await this.checkDailyWithdrawalLimit(amountIDR);

        try {
            const xenditService = new XenditDisbursementService();
            return await xenditService.createDisbursement({
                external_id: paymentIntentId,
                bank_code: bankCode,
                account_number: accountNumber,
                amount: amountIDR,
                description: `SOLQ Payment Settlement for NMID ${merchantNMID}`,
                beneficiary_name: accountHolderName,
                email_to_notify: process.env.SETTLEMENT_NOTIFICATION_EMAIL,
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                paymentIntentId,
                bankCode,
                accountNumber,
                amountIDR,
                error: errorMsg,
                timestamp: new Date().toISOString(),
            });
            throw error;
        }
    }

    private async getMerchantAccount(merchantNMID: string): Promise<any> {
        return await this.prisma.merchantAccount.findFirst({
            where: { merchantNMID },
        });
    }

    private isNearEndOfBatchWindow(): boolean {
        const minuteOfHour = new Date().getMinutes();
        return minuteOfHour >= BATCH_WINDOW_MINUTES - 5;
    }

    private async recordSettlementError(
        paymentIntentId: string,
        errorMsg: string
    ): Promise<void> {
        const settlement = await this.prisma.settlement.findFirst({
            where: { paymentIntentId },
        });

        if (settlement) {
            const newAttemptCount = (settlement.attemptCount || 0) + 1;
            const isFinal = newAttemptCount >= MAX_RETRIES;

            await this.prisma.settlement.update({
                where: { id: settlement.id },
                data: {
                    lastAttemptAt: new Date(),
                    lastError: errorMsg,
                    attemptCount: newAttemptCount,
                    settlementStatus: isFinal ? SettlementStatus.FAILED : SettlementStatus.PENDING,
                },
            });

            AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                paymentIntentId,
                attemptCount: newAttemptCount,
                isFinal,
                error: errorMsg,
                timestamp: new Date().toISOString(),
            });
        }
    }

    private setupListeners(): void {
        this.fastLaneWorker.on('completed', (job: Job) => {
            console.log(`[Settlement] Fast-lane job completed: ${job.id}`);
        });

        this.fastLaneWorker.on('failed', (job: Job | undefined, err: Error) => {
            console.error(`[Settlement] Fast-lane job failed: ${job?.id}, Error: ${err.message}`);
        });

        this.efficientLaneWorker.on('completed', (job: Job) => {
            console.log(`[Settlement] Efficient-lane job completed: ${job.id}`);
        });

        this.efficientLaneWorker.on('failed', (job: Job | undefined, err: Error) => {
            console.error(`[Settlement] Efficient-lane job failed: ${job?.id}, Error: ${err.message}`);
        });
    }

    async handleXenditWebhook(payload: any): Promise<void> {
        const { external_id, status, id: xenditId } = payload;

        const settlement = await this.prisma.settlement.findFirst({
            where: { paymentIntentId: external_id },
        });

        if (!settlement) {
            console.warn(`[Settlement] Webhook for unknown settlement: ${external_id}`);
            return;
        }

        let settlementStatus = SettlementStatus.PROCESSING;
        if (status === 'COMPLETED') {
            settlementStatus = SettlementStatus.COMPLETED;
        } else if (status === 'FAILED') {
            settlementStatus = SettlementStatus.FAILED;
        }

        await this.prisma.settlement.update({
            where: { id: settlement.id },
            data: {
                settlementStatus,
                completedAt: status === 'COMPLETED' ? new Date() : null,
            },
        });

        AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
            paymentIntentId: external_id,
            xenditId,
            status: settlementStatus,
            timestamp: new Date().toISOString(),
        });
    }

    async close(): Promise<void> {
        await this.fastLaneWorker.close();
        await this.efficientLaneWorker.close();
        await this.fastLaneQueue.close();
        await this.efficientLaneQueue.close();
        await this.redis.quit();
    }
}

export default SettlementQueueService;
