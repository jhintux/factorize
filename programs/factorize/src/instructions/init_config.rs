use anchor_lang::prelude::*;

use crate::{errors::FactorizeError, state::Config};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, 
        payer = admin,
        space = Config::DISCRIMINATOR.len() + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitConfig<'info> {
    pub fn init_config(
        &mut self,
        treasury: Pubkey,
        usdc_mint: Pubkey,
        protocol_fee_bps: u16,
        bumps: &InitConfigBumps,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 10_000, FactorizeError::Unauthorized);
        require_keys_neq!(usdc_mint, Pubkey::default(), FactorizeError::InvalidMint);

        self.config.set_inner(Config {
            admin: self.admin.key(),
            treasury,
            usdc_mint,
            protocol_fee_bps,
            paused: false,
            bump: bumps.config,
        });
        Ok(())
    }
}
