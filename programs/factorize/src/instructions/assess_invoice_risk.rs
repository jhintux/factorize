use anchor_lang::prelude::*;

use crate::{errors::FactorizeError, state::{lifecycle, InvoiceStatus, InvoiceVault}};

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct AssessInvoiceRisk<'info> {
    pub analyst: Signer<'info>,
    #[account(
        mut,
        seeds = [b"invoice_vault", invoice_vault.sme.as_ref(), invoice_id.as_bytes()],
        bump = invoice_vault.bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
    pub system_program: Program<'info, System>,
}

impl<'info> AssessInvoiceRisk<'info> {
    pub fn assess_invoice_risk(&mut self, _invoice_id: String, invoice_hash: [u8; 32]) -> Result<()> {
        require_keys_eq!(self.invoice_vault.analyst, Pubkey::default(), FactorizeError::AlreadyAssessed);

        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status != InvoiceStatus::Funding {
            return Err(FactorizeError::FundingPeriodEnded.into());
        }

        if now > self.invoice_vault.due_date {
            self.invoice_vault.status = InvoiceStatus::Expired;
            return Err(FactorizeError::InvoiceExpired.into());
        }

        self.invoice_vault.invoice_hash = invoice_hash;
        self.invoice_vault.analyst = self.analyst.key();
        self.invoice_vault.verified_at = now;

        Ok(())
    }
}