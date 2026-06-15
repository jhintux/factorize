use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::TransferChecked,
    token_interface::{
        mint_to_checked, transfer_checked, Mint, MintToChecked, TokenAccount, TokenInterface,
    },
};

use crate::{
    errors::FactorizeError,
    state::{lifecycle, InvoiceStatus, InvoiceVault},
};

#[derive(Accounts)]
#[instruction(_invoice_id: String)]
pub struct FundInvoice<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"invoice_vault", invoice_vault.sme.as_ref(), _invoice_id.as_bytes()],
        bump = invoice_vault.bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = invoice_vault,
        associated_token::token_program = token_program,
    )]
    pub invoice_vault_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = investor,
        associated_token::token_program = token_program,
    )]
    pub usdc_investor_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = shares,
        associated_token::authority = investor,
        associated_token::token_program = token_program,
    )]
    pub shares_investor_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"shares", invoice_vault.sme.as_ref(), _invoice_id.as_bytes()],
        bump
    )]
    pub shares: InterfaceAccount<'info, Mint>,
    #[account(constraint = usdc_mint.is_initialized == true)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> FundInvoice<'info> {
    pub fn fund_invoice(&mut self, _invoice_id: String, fund_amount: u64) -> Result<()> {
        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status != InvoiceStatus::Funding {
            return Err(FactorizeError::FundingPeriodEnded.into());
        }

        require!(self.invoice_vault.verified_at > 0, FactorizeError::NotAssessed);

        let available_funds = self
            .invoice_vault
            .advance_amount
            .checked_sub(self.invoice_vault.funding_amount)
            .ok_or(FactorizeError::CheckedSubOverflow)?;
        if available_funds == 0 {
            return Err(FactorizeError::FundingAmountExceeded.into());
        }

        let actual_fund = fund_amount.min(available_funds);

        // investor transfer usdc to vault
        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.usdc_investor_ata.to_account_info(),
                    to: self.invoice_vault_ata.to_account_info(),
                    authority: self.investor.to_account_info(),
                    mint: self.usdc_mint.to_account_info(),
                },
            ),
            actual_fund,
            self.usdc_mint.decimals,
        )?;

        // update invoice vault
        self.invoice_vault.funding_amount = self
            .invoice_vault
            .funding_amount
            .checked_add(actual_fund)
            .ok_or(FactorizeError::CheckedAddOverflow)?;

        if self.invoice_vault.funding_amount >= self.invoice_vault.advance_amount {
            self.invoice_vault.status = InvoiceStatus::InProgress;
        }

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"invoice_vault",
            self.invoice_vault.sme.as_ref(),
            _invoice_id.as_bytes(),
            &[self.invoice_vault.bump],
        ]];

        // mint shares to investor
        mint_to_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                MintToChecked {
                    mint: self.shares.to_account_info(),
                    to: self.shares_investor_ata.to_account_info(),
                    authority: self.invoice_vault.to_account_info(),
                },
                signer_seeds,
            ),
            actual_fund,
            self.shares.decimals,
        )
    }
}
