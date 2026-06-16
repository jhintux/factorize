use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    errors::FactorizeError,
    math::Calculator,
    state::{lifecycle, Config, InvoiceStatus, InvoiceVault},
};

#[derive(Accounts)]
#[instruction(_invoice_id: String)]
pub struct SettleInvoice<'info> {
    #[account(
        mut,
        constraint = sme.key() == invoice_vault.sme @ FactorizeError::Unauthorized
    )]
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
        associated_token::authority = invoice_vault,
        associated_token::token_program = token_program,
    )]
    pub invoice_vault_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = sme,
        associated_token::token_program = token_program,
    )]
    pub usdc_sme_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
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
    /// CHECK: validated against config.treasury
    #[account(address = config.treasury @ FactorizeError::Unauthorized)]
    pub treasury: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> SettleInvoice<'info> {
    pub fn settle_invoice(&mut self, _invoice_id: String, repayment_amount: u64) -> Result<()> {
        self.config.require_not_paused()?;

        let now = lifecycle::now()?;
        lifecycle::sync_invoice_status(&mut self.invoice_vault, now);

        if self.invoice_vault.status != InvoiceStatus::InProgress {
            return Err(FactorizeError::InvoiceNotInProgress.into());
        }

        let profit = repayment_amount
            .checked_sub(self.invoice_vault.funding_amount)
            .ok_or(FactorizeError::InsufficientSettlement)?;
        let fee = Calculator::fee_amount(profit, self.config.protocol_fee_bps)?;
        let investor_pool = repayment_amount
            .checked_sub(fee)
            .ok_or(FactorizeError::CheckedSubOverflow)?;

        self.invoice_vault.settled_share_supply = self.shares.supply;
        self.invoice_vault.settlement_pool = investor_pool;
        self.invoice_vault.claimed_amount = 0;
        self.invoice_vault.repayment_amount = repayment_amount;
        self.invoice_vault.status = InvoiceStatus::Settled;

        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.usdc_sme_ata.to_account_info(),
                    to: self.invoice_vault_ata.to_account_info(),
                    authority: self.sme.to_account_info(),
                    mint: self.usdc_mint.to_account_info(),
                },
            ),
            investor_pool,
            self.usdc_mint.decimals,
        )?;

        if fee > 0 {
            transfer_checked(
                CpiContext::new(
                    self.token_program.to_account_info(),
                    TransferChecked {
                        from: self.usdc_sme_ata.to_account_info(),
                        to: self.treasury_ata.to_account_info(),
                        authority: self.sme.to_account_info(),
                        mint: self.usdc_mint.to_account_info(),
                    },
                ),
                fee,
                self.usdc_mint.decimals,
            )?;
        }

        Ok(())
    }
}
