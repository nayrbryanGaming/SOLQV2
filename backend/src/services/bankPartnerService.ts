/**
 * Mock Off-Ramp Partner Service
 * Simulates interaction with a licensed PJP/Exchange
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
     * Requests settlement from a licensed Partner to a destination wallet/bank.
     * WarungPay acts as an orchestrator, requesting the partner to execute the transfer.
     */
    public static async requestSettlement(request: DisbursementRequest): Promise<DisbursementResponse> {
        console.log(`[BankPartner] Requesting settlement of Rp ${request.amount} to ${request.destinationAccount.bankCode}::${request.destinationAccount.accountNumber}`);

        // Simulate API Latency
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Simulate Success Rate (90%)
        const isSuccess = Math.random() > 0.1;

        if (!isSuccess) {
            console.error(`[BankPartner] Settlement request failed for Ref: ${request.referenceId}`);
            return {
                status: 'FAILED',
                partnerRef: `err_${Date.now()}`,
                timestamp: new Date().toISOString()
            };
        }

        console.log(`[BankPartner] Settlement request accepted by partner for Ref: ${request.referenceId}`);
        return {
            status: 'SUCCESS',
            partnerRef: `txn_${Date.now()}`,
            timestamp: new Date().toISOString()
        };
    }
}
