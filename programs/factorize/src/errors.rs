use anchor_lang::prelude::*;

#[error_code]
pub enum FactorizeError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invoice already assessed")]
    AlreadyAssessed,
    #[msg("Invoice expired")]
    InvoiceExpired,

    #[msg("Funding amount exceeded")]
    FundingAmountExceeded,
    #[msg("Invoice has defaulted")]
    InvoiceDefaulted,
    #[msg("Invoice is in progress")]
    InvoiceInProgress,
    #[msg("Invoice is not in progress")]
    InvoiceNotInProgress,

    #[msg("Conversion failure")]
    ConversionFailure,
    #[msg("Checked mul overflow")]
    CheckedMulOverflow,
    #[msg("Checked div overflow")]
    CheckedDivOverflow,
    #[msg("Checked add overflow")]
    CheckedAddOverflow,
    #[msg("Checked sub overflow")]
    CheckedSubOverflow,
    #[msg("Settlement amount is below funded principal")]
    InsufficientSettlement,
    #[msg("Invoice has not been assessed")]
    NotAssessed,
    #[msg("Invoice funding period has ended")]
    FundingPeriodEnded,
}