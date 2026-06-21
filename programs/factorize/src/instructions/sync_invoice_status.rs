use anchor_lang::prelude::*;

use crate::{
    events::InvoiceStatusSynced,
    state::{lifecycle, InvoiceVault},
};

/// Permissionless keeper hook: applies due_date / settle_date transitions only.
#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct SyncInvoiceStatus<'info> {
    #[account(
        mut,
        seeds = [b"invoice_vault", invoice_vault.sme.as_ref(), invoice_id.as_bytes()],
        bump = invoice_vault.bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
}

impl<'info> SyncInvoiceStatus<'info> {
    pub fn sync_invoice_status(&mut self, invoice_id: String) -> Result<()> {
        let status_before = self.invoice_vault.status;
        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status != status_before {
            emit!(InvoiceStatusSynced {
                sme: self.invoice_vault.sme,
                invoice_id,
                status: self.invoice_vault.status,
            });
        }

        Ok(())
    }
}
