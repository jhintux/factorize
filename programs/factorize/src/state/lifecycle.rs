use anchor_lang::prelude::*;

use super::{InvoiceStatus, InvoiceVault};

/// Applies time-based status transitions when any instruction touches the vault.
/// Permissionless and safe: only moves forward on strict clock + balance conditions.
pub fn sync_invoice_status(invoice_vault: &mut InvoiceVault, now: i64) {
    match invoice_vault.status {
        InvoiceStatus::Funding => {
            if now > invoice_vault.due_date
                && invoice_vault.funding_amount < invoice_vault.advance_amount
            {
                invoice_vault.status = InvoiceStatus::Expired;
            }
        }
        InvoiceStatus::InProgress => {
            if now > invoice_vault.settle_date {
                invoice_vault.status = InvoiceStatus::Defaulted;
            }
        }
        _ => {}
    }
}

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}
