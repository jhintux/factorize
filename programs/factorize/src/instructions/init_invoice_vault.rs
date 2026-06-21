use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    errors::FactorizeError,
    events::InvoiceVaultInitialized,
    state::{Config, InvoiceStatus, InvoiceVault, InvoiceVaultProps},
};

#[derive(Accounts)]
#[instruction(props: InvoiceVaultProps)]
pub struct InitInvoiceVault<'info> {
    #[account(mut)]
    pub sme: Signer<'info>,
    #[account(
        init,
        payer = sme,
        space = InvoiceVault::DISCRIMINATOR.len() + InvoiceVault::INIT_SPACE,
        seeds = [b"invoice_vault", sme.key().as_ref(), props.invoice_id.as_bytes()],
        bump
    )]
    pub invoice_vault: Account<'info, InvoiceVault>,
    #[account(
        init,
        payer = sme,
        seeds = [b"shares", sme.key().as_ref(), props.invoice_id.as_bytes()],
        bump,
        mint::decimals = 6,
        mint::authority = invoice_vault,
    )]
    pub shares: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = sme,
        associated_token::mint = usdc_mint,
        associated_token::authority = invoice_vault,
        associated_token::token_program = token_program,
    )]
    pub invoice_vault_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        constraint = usdc_mint.key() == config.usdc_mint @ FactorizeError::InvalidMint,
        constraint = usdc_mint.is_initialized == true
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> InitInvoiceVault<'info> {
    pub fn init_invoice_vault(
        &mut self,
        props: InvoiceVaultProps,
        bump: &InitInvoiceVaultBumps,
    ) -> Result<()> {
        self.config.require_not_paused()?;

        self.invoice_vault.set_inner(InvoiceVault {
            advance_amount: props.advance_amount,
            funding_amount: 0,
            repayment_amount: props.repayment_amount,
            settled_share_supply: 0,
            settlement_pool: 0,
            claimed_amount: 0,
            due_date: props.due_date,
            settle_date: props.settle_date,
            invoice_hash: [0u8; 32],
            sme: self.sme.key(),
            analyst: Pubkey::default(),
            verified_at: 0,
            status: InvoiceStatus::Funding,
            bump: bump.invoice_vault,
        });

        emit!(InvoiceVaultInitialized {
            sme: self.sme.key(),
            invoice_id: props.invoice_id.clone(),
            vault: self.invoice_vault.key(),
            shares_mint: self.shares.key(),
            advance_amount: props.advance_amount,
            repayment_amount: props.repayment_amount,
            due_date: props.due_date,
            settle_date: props.settle_date,
        });

        Ok(())
    }
}
