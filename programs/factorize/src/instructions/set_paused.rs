use anchor_lang::prelude::*;

use crate::{errors::FactorizeError, state::Config};

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(address = config.admin @ FactorizeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
}

impl SetPaused<'_> {
    pub fn set_paused(&mut self, paused: bool) -> Result<()> {
        self.config.paused = paused;
        Ok(())
    }
}
