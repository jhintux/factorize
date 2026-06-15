use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct InvoiceVault {
    /// advance paid to SME (80–95% of face value); target for investor funding
    pub advance_amount: u64,
    /// amount investors have deposited
    pub funding_amount: u64,
    /// full receivable value when the debtor pays (face value + interest)
    pub repayment_amount: u64,
    /// total shares outstanding when the invoice was settled
    pub settled_share_supply: u64,
    /// fixed USDC pool for investor claims after settlement
    pub settlement_pool: u64,
    /// running total paid out from settlement_pool
    pub claimed_amount: u64,

    pub due_date: i64,
    pub settle_date: i64,

    pub sme: Pubkey,
    pub analyst: Pubkey,

    pub invoice_hash: [u8; 32],

    pub verified_at: i64,

    pub status: InvoiceStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq)]
pub enum InvoiceStatus {
    Funding,
    InProgress,
    Settled,
    Expired,
    Defaulted,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InvoiceVaultProps {
    pub advance_amount: u64,
    pub repayment_amount: u64,
    pub due_date: i64,
    pub settle_date: i64,
    pub invoice_id: String,
}
