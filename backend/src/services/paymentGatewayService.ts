/**
 * SOLQ PAYMENT GATEWAY ADAPTER
 *
 * Default path (IDRX_DIRECT): delegates to BankPartnerService which calls
 * the real IDRX off-ramp API. This is the PRODUCTION path.
 *
 * Xendit / Midtrans paths: REQUIRE real API key configuration.
 * Set PJP_PROVIDER + PJP_API_KEY env vars to activate.
 * These paths are deliberately NOT stubbed — a fake SUCCESS here would mean
 * funds are never disbursed to the merchant. We fail loudly instead.
 */

import fetch from 'node-fetch';

export enum PJPProvider {
    XENDIT = 'XENDIT',
    MIDTRANS = 'MIDTRANS',
    OY = 'OY',
    IDRX_DIRECT = 'IDRX_DIRECT',
}

interface DisbursementRequest {
    amount: number;
    destinationBank: string;
    destinationAccount: string;
    description: string;
    referenceId: string;
}

interface DisbursementResult {
    status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'DELEGATED';
    ref: string;
    message?: string;
}

export class PaymentGatewayService {
    private static get apiKey(): string { return process.env.PJP_API_KEY || ''; }
    private static get provider(): PJPProvider {
        return (process.env.PJP_PROVIDER as PJPProvider) || PJPProvider.IDRX_DIRECT;
    }

    public static async disburse(req: DisbursementRequest): Promise<DisbursementResult> {
        console.log(`[PJP] Disbursement via ${this.provider} | Rp ${req.amount.toLocaleString()} → ${req.destinationBank}:${req.destinationAccount}`);

        switch (this.provider) {
            case PJPProvider.XENDIT:
                return this.callXendit(req);
            case PJPProvider.MIDTRANS:
                return this.callMidtrans(req);
            case PJPProvider.OY:
                return this.callOy(req);
            case PJPProvider.IDRX_DIRECT:
            default:
                // IDRX_DIRECT delegates to BankPartnerService — that is the real production path
                return { status: 'DELEGATED', ref: req.referenceId, message: 'Delegated to IDRX off-ramp' };
        }
    }

    // ── XENDIT ─────────────────────────────────────────────────────────────────
    private static async callXendit(req: DisbursementRequest): Promise<DisbursementResult> {
        if (!this.apiKey) {
            throw new Error('[XENDIT] PJP_API_KEY not configured. Set env var to activate Xendit disbursement.');
        }

        // POST https://api.xendit.co/disbursements
        const body = {
            external_id: req.referenceId,
            bank_code: req.destinationBank.toUpperCase(),
            account_holder_name: 'SOLQ MERCHANT',
            account_number: req.destinationAccount,
            description: req.description,
            amount: Math.round(req.amount),
        };

        const res = await fetch('https://api.xendit.co/disbursements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
            },
            body: JSON.stringify(body),
            timeout: 15000,
        } as any);

        const data: any = await res.json();
        console.log(`[XENDIT] Response [${res.status}]:`, JSON.stringify(data).slice(0, 300));

        if (res.ok && data.id && (data.status === 'COMPLETED' || data.status === 'PENDING')) {
            return {
                status: data.status === 'COMPLETED' ? 'SUCCESS' : 'PENDING',
                ref: data.id,
                message: `Xendit disbursement ${data.status}`,
            };
        }

        throw new Error(`[XENDIT] Disbursement failed [${res.status}]: ${data.message || data.error_code || JSON.stringify(data)}`);
    }

    // ── MIDTRANS IRIS ──────────────────────────────────────────────────────────
    private static async callMidtrans(req: DisbursementRequest): Promise<DisbursementResult> {
        if (!this.apiKey) {
            throw new Error('[MIDTRANS] PJP_API_KEY not configured. Set env var to activate Midtrans Iris disbursement.');
        }

        const body = {
            beneficiaries: [{
                alias_name: req.referenceId.slice(0, 20),
                account: req.destinationAccount,
                bank_name: req.destinationBank.toUpperCase(),
                name: 'SOLQ MERCHANT',
                amount: Math.round(req.amount).toString(),
                notes: req.description,
            }],
        };

        const res = await fetch('https://app.midtrans.com/iris/api/v1/payouts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
            },
            body: JSON.stringify(body),
            timeout: 15000,
        } as any);

        const data: any = await res.json();
        console.log(`[MIDTRANS] Response [${res.status}]:`, JSON.stringify(data).slice(0, 300));

        if (res.ok && data.payouts?.length > 0) {
            const payout = data.payouts[0];
            return {
                status: payout.status === 'processed' ? 'SUCCESS' : 'PENDING',
                ref: payout.reference_no || req.referenceId,
                message: `Midtrans Iris: ${payout.status}`,
            };
        }

        throw new Error(`[MIDTRANS] Iris payout failed [${res.status}]: ${data.error_message || JSON.stringify(data)}`);
    }

    // ── OY! INDONESIA ──────────────────────────────────────────────────────────
    private static async callOy(req: DisbursementRequest): Promise<DisbursementResult> {
        if (!this.apiKey) {
            throw new Error('[OY] PJP_API_KEY not configured. Set env var to activate OY! disbursement.');
        }

        const body = {
            recipient_bank: req.destinationBank.toUpperCase(),
            recipient_account: req.destinationAccount,
            amount: Math.round(req.amount),
            note: req.description,
            partner_trx_id: req.referenceId,
            email: '',
        };

        const res = await fetch('https://api-stg.oyindonesia.com/api/remit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-oy-username': 'solq',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify(body),
            timeout: 15000,
        } as any);

        const data: any = await res.json();
        console.log(`[OY] Response [${res.status}]:`, JSON.stringify(data).slice(0, 300));

        if (res.ok && data.status?.code === '101') {
            return {
                status: 'PENDING',
                ref: data.trx_id || req.referenceId,
                message: `OY! remit: ${data.status?.message}`,
            };
        }

        throw new Error(`[OY] Remit failed [${res.status}]: ${data.status?.message || JSON.stringify(data)}`);
    }
}
