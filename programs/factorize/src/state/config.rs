use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub paused: bool,
    pub protocol_fee_bps: u16,
    pub bump: u8,
}