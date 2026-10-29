use crate::Fault;
use anchor_lang::prelude::*;
pub const BPS: u64 = 10_000;
pub const SUPPLY: u64 = 1_000_000_000_000_000;
pub const INITIAL_TOKENS: u64 = 1_073_000_000_000_000;
pub const CURVE_TOKENS: u64 = 793_100_000_000_000;
pub const POOL_TOKENS: u64 = SUPPLY - CURVE_TOKENS;
pub const MIN_TOKENS: u64 = INITIAL_TOKENS - CURVE_TOKENS;
pub const INITIAL_SOL: u64 = 30_000_000_000;
pub const WEEK: i64 = 604_800;
pub fn epoch(now: i64) -> u64 {
    ((now - 345_600) / WEEK) as u64
}
pub fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(error!(Fault::Overflow))
}
pub fn sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or(error!(Fault::Insufficient))
}
pub fn mul_div(a: u64, b: u64, c: u64) -> Result<u64> {
    require!(c > 0, Fault::Invalid);
    u64::try_from((a as u128) * (b as u128) / c as u128).map_err(|_| error!(Fault::Overflow))
}
pub fn ceil(a: u128, b: u64) -> Result<u64> {
    require!(b > 0, Fault::Invalid);
    u64::try_from(a.div_ceil(b as u128)).map_err(|_| error!(Fault::Overflow))
}
pub fn buy_bps(launched: i64, now: i64, initial: bool) -> u64 {
    if initial {
        100
    } else {
        100 + 3900 * (60 - (now - launched).clamp(0, 60)) as u64 / 60
    }
}
#[derive(Debug, PartialEq)]
pub struct Fee {
    pub total: u64,
    pub creator: u64,
    pub platform: u64,
    pub raffle: u64,
}
pub fn fee(gross: u64, bps: u64) -> Result<Fee> {
    require!(bps <= 4000, Fault::Invalid);
    let total = mul_div(gross, bps, BPS)?;
    let creator = mul_div(total, 4000, BPS)?;
    let platform = mul_div(total, 4000, BPS)?;
    Ok(Fee {
        total,
        creator,
        platform,
        raffle: total - creator - platform,
    })
}
#[derive(Debug)]
pub struct Quote {
    pub gross: u64,
    pub output: u64,
    pub next_sol: u64,
    pub next_tokens: u64,
    pub fees: Fee,
}
pub fn buy(sol: u64, tokens: u64, gross: u64, bps: u64, curve: bool) -> Result<Quote> {
    require!(gross > 0 && sol > 0 && tokens > 0, Fault::Invalid);
    let floor = if curve { MIN_TOKENS } else { 1 };
    let k = sol as u128 * tokens as u128;
    let mut consumed = gross;
    let mut next_tokens = ceil(k, add(sol, sub(gross, fee(gross, bps)?.total)?)?)?;
    if next_tokens <= floor {
        let needed = sub(ceil(k, floor)?, sol)?;
        consumed = ceil(needed as u128 * BPS as u128, BPS - bps)?;
        while consumed > 0 && consumed - 1 - fee(consumed - 1, bps)?.total >= needed {
            consumed -= 1;
        }
        require!(consumed <= gross, Fault::Invalid);
        next_tokens = floor;
    }
    let fees = fee(consumed, bps)?;
    let output = sub(tokens, next_tokens)?;
    require!(output > 0, Fault::ZeroOutput);
    Ok(Quote {
        gross: consumed,
        output,
        next_sol: add(sol, consumed - fees.total)?,
        next_tokens,
        fees,
    })
}
pub fn sell(sol: u64, tokens: u64, amount: u64, curve: bool) -> Result<Quote> {
    require!(amount > 0 && sol > 0 && tokens > 0, Fault::Invalid);
    let next_tokens = add(tokens, amount)?;
    require!(!curve || next_tokens <= INITIAL_TOKENS, Fault::Invalid);
    let next_sol = ceil(sol as u128 * tokens as u128, next_tokens)?;
    let gross = sub(sol, next_sol)?;
    let fees = fee(gross, 100)?;
    let output = sub(gross, fees.total)?;
    require!(output > 0, Fault::ZeroOutput);
    Ok(Quote {
        gross,
        output,
        next_sol,
        next_tokens,
        fees,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decay() {
        assert_eq!(buy_bps(0, 0, false), 4000);
        assert_eq!(buy_bps(0, 30, false), 2050);
        assert_eq!(buy_bps(0, 60, false), 100);
        assert_eq!(buy_bps(0, 90, false), 100);
        assert_eq!(buy_bps(0, 0, true), 100);
    }
    #[test]
    fn allocations() {
        for gross in 1..10000 {
            let f = fee(gross, 4000).unwrap();
            assert_eq!(f.creator + f.platform + f.raffle, f.total);
        }
    }
    #[test]
    fn buy_sell_invariant() {
        for gross in [1000, 100_000, 1_000_000, 1_000_000_000, 10_000_000_000] {
            let b = buy(INITIAL_SOL, INITIAL_TOKENS, gross, 100, true).unwrap();
            assert!(
                b.next_sol as u128 * b.next_tokens as u128
                    >= INITIAL_SOL as u128 * INITIAL_TOKENS as u128
            );
            let s = sell(b.next_sol, b.next_tokens, b.output, true).unwrap();
            assert!(s.output < gross);
            assert!(s.next_tokens == INITIAL_TOKENS);
        }
    }
    #[test]
    fn final_buy_capped() {
        let b = buy(INITIAL_SOL, INITIAL_TOKENS, 1_000_000_000_000, 4000, true).unwrap();
        assert_eq!(b.output, CURVE_TOKENS);
        assert_eq!(b.next_tokens, MIN_TOKENS);
        assert!(b.gross < 1_000_000_000_000);
    }
    #[test]
    fn pool_swap() {
        let b = buy(85_000_000_000, POOL_TOKENS, 1_000_000_000, 100, false).unwrap();
        assert!(
            b.next_sol as u128 * b.next_tokens as u128 >= 85_000_000_000u128 * POOL_TOKENS as u128
        );
    }
    #[test]
    fn rejects_invalid() {
        assert!(buy(0, INITIAL_TOKENS, 1000, 100, true).is_err());
        assert!(sell(INITIAL_SOL, INITIAL_TOKENS, 1, true).is_err());
        assert!(add(u64::MAX, 1).is_err());
    }
}
