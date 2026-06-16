use anchor_lang::prelude::*;

use crate::{errors::FactorizeError, state::{AnalystWhitelist, Config}};

#[derive(Accounts)]
pub struct RemoveAnalyst<'info> {
    #[account(mut, address = config.admin @ FactorizeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: analyst pubkey to remove from whitelist
    pub analyst: UncheckedAccount<'info>,
    #[account(
        mut,
        close = admin,
        seeds = [b"analyst", analyst.key().as_ref()],
        bump = analyst_whitelist.bump
    )]
    pub analyst_whitelist: Account<'info, AnalystWhitelist>,
}

impl RemoveAnalyst<'_> {
    pub fn remove_analyst(&mut self) -> Result<()> {
        Ok(())
    }
}
