use uint::construct_uint;

use crate::errors::FactorizeError;

construct_uint! {
    pub struct U128(2);
}

#[derive(Clone, Debug, PartialEq)]
pub struct Calculator {}

impl Calculator {
    pub fn to_u128(val: u64) -> Result<U128, FactorizeError> {
        val.try_into()
            .map_err(|_| FactorizeError::ConversionFailure)
    }

    pub fn to_u64(val: u128) -> Result<u64, FactorizeError> {
        val.try_into()
            .map_err(|_| FactorizeError::ConversionFailure)
    }

    pub fn proportional_amount(
        shares: u64,
        total_shares: u64,
        pool: u64,
    ) -> Result<u64, FactorizeError> {
        Calculator::to_u64(
            Calculator::to_u128(shares)?
                .checked_mul(Calculator::to_u128(pool)?)
                .ok_or(FactorizeError::CheckedMulOverflow)?
                .checked_div(Calculator::to_u128(total_shares)?)
                .ok_or(FactorizeError::CheckedDivOverflow)?
                .as_u128(),
        )
    }

    pub fn fee_amount(profit: u64, protocol_fee_bps: u16) -> Result<u64, FactorizeError> {
        Calculator::to_u64(
            Calculator::to_u128(profit)?
                .checked_mul(Calculator::to_u128(protocol_fee_bps as u64)?)
                .ok_or(FactorizeError::CheckedMulOverflow)?
                .checked_div(Calculator::to_u128(10_000)?)
                .ok_or(FactorizeError::CheckedDivOverflow)?
                .as_u128(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proportional_amount_splits_pool() {
        assert_eq!(
            Calculator::proportional_amount(50, 100, 10_000).unwrap(),
            5_000
        );
    }

    #[test]
    fn proportional_amount_last_claimer_absorbs_dust() {
        let pool = 10_003u64;
        let total = 100u64;
        let first = Calculator::proportional_amount(33, total, pool).unwrap();
        let second = Calculator::proportional_amount(33, total, pool).unwrap();
        let remainder = pool - first - second;

        assert_eq!(first, 3_300);
        assert_eq!(second, 3_300);
        assert_eq!(remainder, 3_403);
    }
}
