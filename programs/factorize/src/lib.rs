use anchor_lang::prelude::*;

mod instructions;
mod state;
mod errors;
mod math;

use instructions::*;
use state::*;

declare_id!("6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT");

#[program]
pub mod factorize {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        treasury: Pubkey,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts.init_config(treasury, protocol_fee_bps, &ctx.bumps)
    }

    pub fn init_invoice_vault(
        ctx: Context<InitInvoiceVault>,
        props: InvoiceVaultProps,
    ) -> Result<()> {
        ctx.accounts.init_invoice_vault(props, &ctx.bumps)
    }

    pub fn assess_invoice_risk(ctx: Context<AssessInvoiceRisk>, invoice_id: String, invoice_hash: [u8; 32]) -> Result<()> {
        ctx.accounts.assess_invoice_risk(invoice_id, invoice_hash)
    }

    pub fn fund_invoice(ctx: Context<FundInvoice>, invoice_id: String, fund_amount: u64) -> Result<()> {
        ctx.accounts.fund_invoice(invoice_id, fund_amount)
    }

    pub fn settle_invoice(ctx: Context<SettleInvoice>, invoice_id: String, repayment_amount: u64) -> Result<()> {
        ctx.accounts.settle_invoice(invoice_id, repayment_amount)
    }

    pub fn claim_invoice(ctx: Context<ClaimInvoice>, invoice_id: String) -> Result<()> {
        ctx.accounts.claim_invoice(invoice_id)
    }

    pub fn claim_investment(ctx: Context<ClaimInvestment>, invoice_id: String, shares: u64) -> Result<()> {
        ctx.accounts.claim_investment(invoice_id, shares)
    }

    pub fn sync_invoice_status(ctx: Context<SyncInvoiceStatus>, _invoice_id: String) -> Result<()> {
        ctx.accounts.sync_invoice_status()
    }
}
