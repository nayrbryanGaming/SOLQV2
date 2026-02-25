"use strict";
/**
 * Mock Off-Ramp Partner Service
 * Simulates interaction with a licensed PJP/Exchange
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankPartnerService = void 0;
class BankPartnerService {
    /**
     * REQUEST SETTLEMENT FROM IDRX (STABELIFY/STRAITSX)
     * SOLQ acts as the Orchestrator.
     * Requirement from Steven/Nael: Use the real 'pipa' off-ramp.
     */
    static requestSettlement(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const apiKey = process.env.IDRX_API_KEY;
            const apiUrl = process.env.IDRX_API_URL || 'https://api.stabelify.id/v1/disbursements';
            console.log(`[IDRX API] Orchestrating settlement for Ref: ${request.referenceId}`);
            if (!apiKey) {
                console.error("[CRITICAL] IDRX_API_KEY is missing. Settlement Request FAILED.");
                throw new Error("Settlement Configuration Error: Missing API Key");
            }
            try {
                // REAL INTEGRATION (The 'Pipa')
                const response = yield fetch(apiUrl, {
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
                const data = yield response.json();
                return {
                    status: response.ok ? 'SUCCESS' : 'FAILED',
                    partnerRef: data.id || `failed_${Date.now()}`,
                    timestamp: new Date().toISOString()
                };
            }
            catch (error) {
                console.error("[IDRX ERROR] Pipeline failure:", error);
                return {
                    status: 'FAILED',
                    partnerRef: `sys_err_${Date.now()}`,
                    timestamp: new Date().toISOString()
                };
            }
        });
    }
}
exports.BankPartnerService = BankPartnerService;
