use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::TransferChecked,
    token_interface::{
        burn_checked, close_account, transfer_checked, BurnChecked, CloseAccount, Mint,
        TokenAccount, TokenInterface,
    },
};

use crate::{
    errors::FactorizeError,
    events::InvestmentClaimed,
    math::Calculator,
    state::{lifecycle, Config, InvoiceStatus, InvoiceVault},
};

#[derive(Accounts)]
#[instruction(_invoice_id: String)]
pub struct ClaimInvestment<'info> {
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
    pub shares: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        constraint = usdc_mint.key() == config.usdc_mint @ FactorizeError::InvalidMint,
        constraint = usdc_mint.is_initialized == true
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [b"config"], bump)]
    pub config: Box<Account<'info, Config>>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ClaimInvestment<'info> {
    pub fn claim_investment(&mut self, invoice_id: String, shares: u64) -> Result<()> {
        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status == InvoiceStatus::InProgress {
            return Err(FactorizeError::InvoiceInProgress.into());
        }

        if self.invoice_vault.status == InvoiceStatus::Defaulted {
            return Err(FactorizeError::InvoiceDefaulted.into());
        }

        let remaining_share_supply = self.shares.supply;
        let mut claim_amount: u64 = 0;

        if self.invoice_vault.status == InvoiceStatus::Funding
            || self.invoice_vault.status == InvoiceStatus::Expired
        {
            claim_amount = shares;
            self.invoice_vault.funding_amount = self
                .invoice_vault
                .funding_amount
                .checked_sub(shares)
                .ok_or(FactorizeError::CheckedSubOverflow)?;
        }

        if self.invoice_vault.status == InvoiceStatus::Settled {
            let is_last_claim = shares == remaining_share_supply;

            claim_amount = if is_last_claim {
                self.invoice_vault
                    .settlement_pool
                    .checked_sub(self.invoice_vault.claimed_amount)
                    .ok_or(FactorizeError::CheckedSubOverflow)?
            } else {
                Calculator::proportional_amount(
                    shares,
                    self.invoice_vault.settled_share_supply,
                    self.invoice_vault.settlement_pool,
                )?
            };

            self.invoice_vault.claimed_amount = self
                .invoice_vault
                .claimed_amount
                .checked_add(claim_amount)
                .ok_or(FactorizeError::CheckedAddOverflow)?;
        }

        // burn shares from investor
        burn_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                BurnChecked {
                    mint: self.shares.to_account_info(),
                    from: self.shares_investor_ata.to_account_info(),
                    authority: self.investor.to_account_info(),
                },
            ),
            shares,
            self.shares.decimals,
        )?;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"invoice_vault",
            self.invoice_vault.sme.as_ref(),
            invoice_id.as_bytes(),
            &[self.invoice_vault.bump],
        ]];

        // transfer usdc from vault to investor
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.invoice_vault_ata.to_account_info(),
                    to: self.usdc_investor_ata.to_account_info(),
                    mint: self.usdc_mint.to_account_info(),
                    authority: self.invoice_vault.to_account_info(),
                },
                signer_seeds,
            ),
            claim_amount,
            self.usdc_mint.decimals,
        )?;

        // if shares is equal to all investor's shares, close investor shares ata
        if shares == self.shares_investor_ata.amount {
            close_account(CpiContext::new(
                self.token_program.to_account_info(),
                CloseAccount {
                    account: self.shares_investor_ata.to_account_info(),
                    authority: self.investor.to_account_info(),
                    destination: self.investor.to_account_info(),
                },
            ))?;
        }

        emit!(InvestmentClaimed {
            sme: self.invoice_vault.sme,
            invoice_id,
            investor: self.investor.key(),
            shares,
            payout: claim_amount,
        });

        Ok(())
    }
}
