/**
 * Bank Partner Service
 * Interaction with licensed PJP/Exchange
 */

interface DisbursementRequest {
    amount: number;
    currency: 'IDR';
    destinationAccount: {
        bankCode: string; // e.g., GOPAY, OVO, BCA
        accountNumber: string;
    };
    referenceId: string;
}

interface DisbursementResponse {
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    partnerRef: string;
    timestamp: string;
}

export class BankPartnerService {
    /**
     * REQUEST SETTLEMENT FROM IDRX (STABELIFY/STRAITSX)
     * SOLQ acts as the Orchestrator. 
     * Requirement from Steven/Nael: Use the real 'pipa' off-ramp.
     */
    public static async requestSettlement(request: DisbursementRequest): Promise<DisbursementResponse> {
        const apiKey = process.env.IDRX_API_KEY;
        const apiUrl = process.env.IDRX_API_URL || 'https://api.stabelify.id/v1/disbursements';

        console.log(`[IDRX API] Orchestrating settlement for Ref: ${request.referenceId}`);

        if (!apiKey) {
            console.error("[CRITICAL] IDRX_API_KEY is missing. Settlement Request FAILED.");
            throw new Error("Settlement Configuration Error: Missing API Key");
        }

        try {
            // REAL INTEGRATION (The 'Pipa')
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey
                },
                body: JSON.stringify({
                    amount: request.amount,
                    currency: 'IDR',
                    bank_code: request.destinationAccount.bankCode,
                    account_number: request.destinationAccount.accountNumber,
                    external_id: request.referenceId
                })
            });

            const data = await response.json();

            return {
                status: response.ok ? 'SUCCESS' : 'FAILED',
                partnerRef: data.id || `failed_${Date.now()}`,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error("[IDRX ERROR] Pipeline failure:", error);
            return {
                status: 'FAILED',
                partnerRef: `sys_err_${Date.now()}`,
                timestamp: new Date().toISOString()
            };
        }
    }
}

