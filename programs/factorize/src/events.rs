use anchor_lang::prelude::*;

use crate::state::InvoiceStatus;

#[event]
pub struct InvoiceVaultInitialized {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub vault: Pubkey,
    pub shares_mint: Pubkey,
    pub advance_amount: u64,
    pub repayment_amount: u64,
    pub due_date: i64,
    pub settle_date: i64,
}

#[event]
pub struct InvoiceRiskAssessed {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub analyst: Pubkey,
    pub invoice_hash: [u8; 32],
    pub verified_at: i64,
}

#[event]
pub struct InvoiceFunded {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub investor: Pubkey,
    pub amount: u64,
    pub funding_amount: u64,
    pub status: InvoiceStatus,
}

#[event]
pub struct InvoiceAdvanceClaimed {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub amount: u64,
}

#[event]
pub struct InvoiceSettled {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub repayment_amount: u64,
    pub settlement_pool: u64,
}

#[event]
pub struct InvoiceAdminSettled {
    pub admin: Pubkey,
    pub sme: Pubkey,
    pub invoice_id: String,
    pub repayment_amount: u64,
    pub settlement_pool: u64,
}

#[event]
pub struct InvestmentClaimed {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub investor: Pubkey,
    pub shares: u64,
    pub payout: u64,
}

#[event]
pub struct InvoiceStatusSynced {
    pub sme: Pubkey,
    pub invoice_id: String,
    pub status: InvoiceStatus,
}
