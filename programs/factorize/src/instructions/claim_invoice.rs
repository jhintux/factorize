use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    errors::FactorizeError,
    state::{lifecycle, InvoiceStatus, InvoiceVault},
};

#[derive(Accounts)]
#[instruction(_invoice_id: String)]
pub struct ClaimInvoice<'info> {
    #[account(mut)]
    pub sme: Signer<'info>,
    #[account(
        mut,
        seeds = [b"invoice_vault", invoice_vault.sme.as_ref(), _invoice_id.as_bytes()],
        bump = invoice_vault.bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = sme,
        associated_token::token_program = token_program,
    )]
    pub sme_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = invoice_vault,
        associated_token::token_program = token_program,
    )]
    pub invoice_vault_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(constraint = usdc_mint.is_initialized == true)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ClaimInvoice<'info> {
    pub fn claim_invoice(&mut self, _invoice_id: String) -> Result<()> {
        require_keys_eq!(
            self.sme.key(),
            self.invoice_vault.sme,
            FactorizeError::Unauthorized
        );

        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status != InvoiceStatus::InProgress {
            return Err(FactorizeError::InvoiceNotInProgress.into());
        }

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"invoice_vault",
            self.invoice_vault.sme.as_ref(),
            _invoice_id.as_bytes(),
            &[self.invoice_vault.bump],
        ]];

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.invoice_vault_ata.to_account_info(),
                    to: self.sme_ata.to_account_info(),
                    mint: self.usdc_mint.to_account_info(),
                    authority: self.invoice_vault.to_account_info(),
                },
                signer_seeds,
            ),
            self.invoice_vault_ata.amount,
            self.usdc_mint.decimals,
        )?;

        Ok(())
    }
}
