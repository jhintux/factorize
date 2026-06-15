use anchor_lang::prelude::*;

use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, 
        payer = admin,
        space = Config::INIT_SPACE,
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
        protocol_fee_bps: u16,
        bumps: &InitConfigBumps,
    ) -> Result<()> {
        self.config.set_inner(Config {
            admin: self.admin.key(),
            treasury,
            protocol_fee_bps,
            paused: false,
            bump: bumps.config,
        });
        Ok(())
    }
}
