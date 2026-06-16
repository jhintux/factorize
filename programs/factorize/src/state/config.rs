use anchor_lang::prelude::*;

use crate::errors::FactorizeError;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub usdc_mint: Pubkey,
    pub paused: bool,
    pub protocol_fee_bps: u16,
    pub bump: u8,
}

impl Config {
    pub fn require_not_paused(&self) -> Result<()> {
        require!(!self.paused, FactorizeError::Paused);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct AnalystWhitelist {
    pub bump: u8,
}