use anchor_lang::prelude::*;

use crate::state::{lifecycle, InvoiceVault};

/// Permissionless keeper hook: applies due_date / settle_date transitions only.
#[derive(Accounts)]
#[instruction(_invoice_id: String)]
pub struct SyncInvoiceStatus<'info> {
    #[account(
        mut,
        seeds = [b"invoice_vault", invoice_vault.sme.as_ref(), _invoice_id.as_bytes()],
        bump = invoice_vault.bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
}

impl<'info> SyncInvoiceStatus<'info> {
    pub fn sync_invoice_status(&mut self) -> Result<()> {
        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);
        Ok(())
    }
}
