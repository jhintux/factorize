use anchor_lang::prelude::*;

use crate::{errors::FactorizeError, state::{AnalystWhitelist, Config}};

#[derive(Accounts)]
pub struct AddAnalyst<'info> {
    #[account(mut, address = config.admin @ FactorizeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: analyst pubkey to whitelist
    pub analyst: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = AnalystWhitelist::DISCRIMINATOR.len() + AnalystWhitelist::INIT_SPACE,
        seeds = [b"analyst", analyst.key().as_ref()],
        bump
    )]
    pub analyst_whitelist: Account<'info, AnalystWhitelist>,
    pub system_program: Program<'info, System>,
}

impl<'info> AddAnalyst<'info> {
    pub fn add_analyst(&mut self, bumps: &AddAnalystBumps) -> Result<()> {
        self.analyst_whitelist.set_inner(AnalystWhitelist {
            bump: bumps.analyst_whitelist,
        });
        Ok(())
    }
}
