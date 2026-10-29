use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hashv, program::invoke, system_instruction};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{
        self, spl_token::instruction::AuthorityType, Burn, Mint, MintTo, SetAuthority, Token,
        TokenAccount, Transfer,
    },
};
pub mod math;
use anchor_lang::Discriminator;
use math::*;
declare_id!("6SpQkgcbZjbrz94pYuWDy5nmBo3czhDGxft1uTvSUR8w");

#[program]
pub mod waffles {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        genesis: [u8; 32],
        finalizer: Pubkey,
        keeper: Pubkey,
    ) -> Result<()> {
        require!(
            finalizer != Pubkey::default() && keeper != Pubkey::default(),
            Fault::Invalid
        );
        ctx.accounts.config.set_inner(Config {
            authority: ctx.accounts.authority.key(),
            finalizer,
            keeper,
            genesis,
            platform: 0,
            bump: ctx.bumps.config,
        });
        Ok(())
    }
    pub fn init_fund(ctx: Context<InitFund>, kind: u8, mint: Pubkey, epoch_id: u64) -> Result<()> {
        require!(
            kind <= 2 && (kind == 1 || mint == Pubkey::default()) && (kind != 2 || epoch_id == 0),
            Fault::Invalid
        );
        let f = &mut ctx.accounts.fund;
        if f.bump == 0 && f.amount == 0 {
            f.kind = kind;
            f.mint = mint;
            f.epoch = epoch_id;
            f.bump = ctx.bumps.fund;
        }
        require!(
            f.kind == kind && f.mint == mint && f.epoch == epoch_id,
            Fault::Invalid
        );
        Ok(())
    }
    pub fn create(ctx: Context<Create>, args: CreateArgs) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            !args.name.trim().is_empty()
                && args.name.len() <= 32
                && !args.symbol.trim().is_empty()
                && args.symbol.len() <= 10
                && args.description.len() <= 280
                && args.image_uri.len() <= 256,
            Fault::Invalid
        );
        args.routing.validate(args.fee_cliff, now)?;
        ctx.accounts.market.set_inner(Market {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            launched_at: now,
            state: 0,
            virtual_sol: INITIAL_SOL,
            virtual_tokens: INITIAL_TOKENS,
            real_sol: 0,
            direct: 0,
            locked: 0,
            buyback: 0,
            fee_cliff: args.fee_cliff,
            routing: args.routing,
            last_buyback: 0,
            bump: ctx.bumps.market,
            name: args.name.clone(),
            symbol: args.symbol.clone(),
            description: args.description.clone(),
            image_uri: args.image_uri.clone(),
        });
        let mint = ctx.accounts.mint.key();
        let bump = [ctx.bumps.market];
        let seeds: &[&[u8]] = &[b"market", mint.as_ref(), &bump];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.inventory.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            SUPPLY,
        )?;
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.market.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                &[seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;
        emit_cpi!(Created {
            mint,
            creator: ctx.accounts.creator.key(),
            time: now,
            args: args.clone()
        });
        Ok(())
    }
    /// The only discounted initial purchase is in the SAME transaction as create,
    /// immediately after it, with the mint keypair signing both instructions.
    pub fn initial_buy(ctx: Context<InitialBuy>, amount: u64, min_out: u64) -> Result<()> {
        require!(
            ctx.accounts.market.creator == ctx.accounts.creator.key()
                && ctx.accounts.market.real_sol == 0
                && ctx.accounts.market.virtual_tokens == INITIAL_TOKENS,
            Fault::Unauthorized
        );
        // Mint signer is generated for creation and must not be reused. Require the
        // immediately preceding top-level instruction to be our create for this mint.
        let ix = anchor_lang::solana_program::sysvar::instructions::load_current_index_checked(
            &ctx.accounts.instructions,
        )?;
        require!(ix > 0, Fault::Unauthorized);
        let previous =
            anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked(
                ix as usize - 1,
                &ctx.accounts.instructions,
            )?;
        require!(
            previous.program_id == crate::ID
                && previous
                    .data
                    .starts_with(&instruction::Create::DISCRIMINATOR)
                && previous
                    .accounts
                    .iter()
                    .any(|a| a.pubkey == ctx.accounts.mint.key() && a.is_signer),
            Fault::Unauthorized
        );
        require!(
            ctx.accounts.market.launched_at == Clock::get()?.unix_timestamp,
            Fault::Unauthorized
        );
        let now = Clock::get()?.unix_timestamp;
        let q = buy(
            ctx.accounts.market.virtual_sol,
            ctx.accounts.market.virtual_tokens,
            amount,
            100,
            true,
        )?;
        require!(q.output >= min_out, Fault::Slippage);
        pay(
            &ctx.accounts.creator.to_account_info(),
            &ctx.accounts.market.to_account_info(),
            q.gross,
        )?;
        apply_buy(&mut ctx.accounts.market, &q)?;
        transfer_tokens(
            &ctx.accounts.market,
            &ctx.accounts.inventory,
            &ctx.accounts.creator_tokens,
            &ctx.accounts.token_program,
            q.output,
        )?;
        allocate(
            &mut ctx.accounts.market,
            &mut ctx.accounts.config,
            &mut ctx.accounts.raffle,
            &mut ctx.accounts.holders,
            &q.fees,
            now,
        )?;
        emit_cpi!(Traded {
            mint: ctx.accounts.mint.key(),
            trader: ctx.accounts.creator.key(),
            buy: true,
            gross: q.gross,
            net: q.gross - q.fees.total,
            tokens: q.output,
            fee: q.fees.total,
            sol_reserve: ctx.accounts.market.virtual_sol,
            token_reserve: ctx.accounts.market.virtual_tokens,
            time: now,
            protocol: false
        });
        Ok(())
    }
    pub fn trade(ctx: Context<Trade>, is_buy: bool, amount: u64, min_out: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.market.state != 1, Fault::Complete);
        let curve = ctx.accounts.market.state == 0;
        let q = if is_buy {
            buy(
                ctx.accounts.market.virtual_sol,
                ctx.accounts.market.virtual_tokens,
                amount,
                buy_bps(ctx.accounts.market.launched_at, now, false),
                curve,
            )?
        } else {
            sell(
                ctx.accounts.market.virtual_sol,
                ctx.accounts.market.virtual_tokens,
                amount,
                curve,
            )?
        };
        require!(q.output >= min_out, Fault::Slippage);
        if is_buy {
            pay(
                &ctx.accounts.trader.to_account_info(),
                &ctx.accounts.market.to_account_info(),
                q.gross,
            )?;
            apply_buy(&mut ctx.accounts.market, &q)?;
            transfer_tokens(
                &ctx.accounts.market,
                &ctx.accounts.inventory,
                &ctx.accounts.trader_tokens,
                &ctx.accounts.token_program,
                q.output,
            )?;
        } else {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.trader_tokens.to_account_info(),
                        to: ctx.accounts.inventory.to_account_info(),
                        authority: ctx.accounts.trader.to_account_info(),
                    },
                ),
                amount,
            )?;
            ctx.accounts.market.real_sol = sub(ctx.accounts.market.real_sol, q.gross)?;
            ctx.accounts.market.virtual_sol = q.next_sol;
            ctx.accounts.market.virtual_tokens = q.next_tokens;
            move_sol(
                &ctx.accounts.market.to_account_info(),
                &ctx.accounts.trader.to_account_info(),
                q.output,
            )?;
        }
        allocate(
            &mut ctx.accounts.market,
            &mut ctx.accounts.config,
            &mut ctx.accounts.raffle,
            &mut ctx.accounts.holders,
            &q.fees,
            now,
        )?;
        emit_cpi!(Traded {
            mint: ctx.accounts.mint.key(),
            trader: ctx.accounts.trader.key(),
            buy: is_buy,
            gross: q.gross,
            net: if is_buy {
                q.gross - q.fees.total
            } else {
                q.output
            },
            tokens: if is_buy { q.output } else { amount },
            fee: q.fees.total,
            sol_reserve: ctx.accounts.market.virtual_sol,
            token_reserve: ctx.accounts.market.virtual_tokens,
            time: now,
            protocol: false
        });
        Ok(())
    }
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        if ctx.accounts.market.state == 2 {
            return Ok(());
        }
        require!(
            ctx.accounts.market.state == 1
                && ctx.accounts.market.virtual_tokens == MIN_TOKENS
                && ctx.accounts.market.real_sol > 0
                && ctx.accounts.inventory.amount >= POOL_TOKENS,
            Fault::Invalid
        );
        ctx.accounts.market.state = 2;
        ctx.accounts.market.virtual_tokens = POOL_TOKENS;
        ctx.accounts.market.virtual_sol = ctx.accounts.market.real_sol;
        emit_cpi!(Graduated {
            mint: ctx.accounts.market.mint,
            time: Clock::get()?.unix_timestamp,
            sol: ctx.accounts.market.real_sol,
            tokens: POOL_TOKENS
        });
        Ok(())
    }
    pub fn withdraw_fees(ctx: Context<Creator>, locked: bool) -> Result<()> {
        let amount = if locked {
            require!(
                Clock::get()?.unix_timestamp >= ctx.accounts.market.fee_cliff,
                Fault::Locked
            );
            let a = ctx.accounts.market.locked;
            ctx.accounts.market.locked = 0;
            a
        } else {
            let a = ctx.accounts.market.direct;
            ctx.accounts.market.direct = 0;
            a
        };
        move_sol(
            &ctx.accounts.market.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            amount,
        )?;
        Ok(())
    }
    pub fn lock(
        ctx: Context<Lock>,
        nonce: u64,
        amount: u64,
        unlock: i64,
        token_asset: bool,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0 && unlock > now, Fault::Invalid);
        require!(
            ctx.accounts.owner.key() == ctx.accounts.market.creator,
            Fault::Unauthorized
        );
        ctx.accounts.commitment.set_inner(Commitment {
            mint: ctx.accounts.market.mint,
            owner: ctx.accounts.owner.key(),
            amount,
            start: now,
            unlock,
            token_asset,
            withdrawn: false,
            nonce,
            bump: ctx.bumps.commitment,
        });
        if token_asset {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.owner_tokens.to_account_info(),
                        to: ctx.accounts.lock_tokens.to_account_info(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                amount,
            )?;
        } else {
            require!(
                ctx.accounts.owner.key() == ctx.accounts.market.creator,
                Fault::Unauthorized
            );
            ctx.accounts.market.direct = sub(ctx.accounts.market.direct, amount)?;
            move_sol(
                &ctx.accounts.market.to_account_info(),
                &ctx.accounts.commitment.to_account_info(),
                amount,
            )?;
        }
        emit_cpi!(Locked {
            id: ctx.accounts.commitment.key(),
            mint: ctx.accounts.market.mint,
            owner: ctx.accounts.owner.key(),
            amount,
            start: now,
            unlock,
            token_asset
        });
        Ok(())
    }
    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        let c = &mut ctx.accounts.commitment;
        require!(
            !c.withdrawn && Clock::get()?.unix_timestamp >= c.unlock,
            Fault::Locked
        );
        c.withdrawn = true;
        if c.token_asset {
            let nonce = c.nonce.to_le_bytes();
            let bump = [c.bump];
            let seeds: &[&[u8]] = &[b"lock", c.owner.as_ref(), c.mint.as_ref(), &nonce, &bump];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.lock_tokens.to_account_info(),
                        to: ctx.accounts.owner_tokens.to_account_info(),
                        authority: c.to_account_info(),
                    },
                    &[seeds],
                ),
                c.amount,
            )?;
        } else {
            move_sol(
                &c.to_account_info(),
                &ctx.accounts.owner.to_account_info(),
                c.amount,
            )?;
        }
        emit_cpi!(Unlocked {
            id: c.key(),
            time: Clock::get()?.unix_timestamp
        });
        Ok(())
    }
    pub fn prepare_distribution(
        ctx: Context<Prepare>,
        epoch_id: u64,
        kind: u8,
        mint: Pubkey,
        amount: u64,
        snapshot: [u8; 32],
    ) -> Result<()> {
        require!(
            kind <= 2 && amount > 0 && snapshot != [0; 32],
            Fault::Invalid
        );
        require!(
            epoch_id < epoch(Clock::get()?.unix_timestamp),
            Fault::Invalid
        );
        require!(
            ctx.accounts.source.kind == kind && ctx.accounts.source.mint == mint,
            Fault::Invalid
        );
        require!(
            ctx.accounts.source.epoch == if kind == 2 { 0 } else { epoch_id },
            Fault::Invalid
        );
        ctx.accounts.source.amount = sub(ctx.accounts.source.amount, amount)?;
        move_sol(
            &ctx.accounts.source.to_account_info(),
            &ctx.accounts.distribution.to_account_info(),
            amount,
        )?;
        let now = Clock::get()?.unix_timestamp;
        ctx.accounts.distribution.set_inner(Distribution {
            epoch: epoch_id,
            kind,
            mint,
            amount,
            claimed: 0,
            snapshot,
            root: [0; 32],
            committed_at: now,
            beacon_after: now + 60,
            drand_round: 0,
            signature_hash: [0; 32],
            bump: ctx.bumps.distribution,
        });
        emit_cpi!(DistributionPrepared {
            id: ctx.accounts.distribution.key(),
            epoch: epoch_id,
            kind,
            mint,
            amount,
            snapshot,
            beacon_after: now + 60
        });
        Ok(())
    }
    pub fn finalize_distribution(
        ctx: Context<Finalize>,
        root: [u8; 32],
        drand_round: u64,
        signature: Vec<u8>,
        beacon_time: i64,
    ) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(d.root == [0; 32] && root != [0; 32], Fault::Invalid);
        if d.kind == 0 {
            require!(
                beacon_time > d.beacon_after
                    && beacon_time <= d.beacon_after + 3
                    && Clock::get()?.unix_timestamp >= beacon_time
                    && drand_round > 0
                    && !signature.is_empty(),
                Fault::Invalid
            );
        }
        d.root = root;
        d.drand_round = drand_round;
        d.signature_hash = hashv(&[&signature]).to_bytes();
        emit_cpi!(DistributionFinalized {
            id: d.key(),
            root,
            drand_round,
            signature
        });
        Ok(())
    }
    pub fn claim(ctx: Context<Claim>, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(
            amount > 0 && d.root != [0; 32] && proof.len() <= 32,
            Fault::Invalid
        );
        let leaf = hashv(&[
            b"waffles:claim:v1",
            crate::ID.as_ref(),
            &ctx.accounts.config.genesis,
            &d.epoch.to_le_bytes(),
            &[d.kind],
            d.mint.as_ref(),
            ctx.accounts.wallet.key().as_ref(),
            &amount.to_le_bytes(),
        ])
        .to_bytes();
        let mut hash = leaf;
        for sibling in proof {
            hash = if hash < sibling {
                hashv(&[&hash, &sibling]).to_bytes()
            } else {
                hashv(&[&sibling, &hash]).to_bytes()
            };
        }
        require!(
            hash == d.root && add(d.claimed, amount)? <= d.amount,
            Fault::Proof
        );
        d.claimed = add(d.claimed, amount)?;
        ctx.accounts.receipt.amount = amount;
        move_sol(
            &d.to_account_info(),
            &ctx.accounts.wallet.to_account_info(),
            amount,
        )?;
        emit_cpi!(Claimed {
            distribution: d.key(),
            wallet: ctx.accounts.wallet.key(),
            amount
        });
        Ok(())
    }
    pub fn move_fund(ctx: Context<MoveFund>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.source.kind <= 1
                && ctx.accounts.source.epoch < epoch(Clock::get()?.unix_timestamp),
            Fault::Invalid
        );
        require!(
            (ctx.accounts.source.kind == 0
                && ctx.accounts.destination.kind == 2
                && ctx.accounts.destination.epoch == 0)
                || (ctx.accounts.destination.kind == ctx.accounts.source.kind
                    && ctx.accounts.destination.epoch == ctx.accounts.source.epoch + 1),
            Fault::Invalid
        );
        ctx.accounts.source.amount = sub(ctx.accounts.source.amount, amount)?;
        ctx.accounts.destination.amount = add(ctx.accounts.destination.amount, amount)?;
        move_sol(
            &ctx.accounts.source.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
            amount,
        )?;
        emit_cpi!(FundMoved {
            source: ctx.accounts.source.key(),
            destination: ctx.accounts.destination.key(),
            amount
        });
        Ok(())
    }
    pub fn buyback(
        ctx: Context<Buyback>,
        amount: u64,
        min_out: u64,
        reference_out: u64,
        incentives: bool,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.market.state == 2
                && now >= ctx.accounts.market.last_buyback + 3600
                && amount > 0
                && amount <= ctx.accounts.market.real_sol / 1000,
            Fault::Invalid
        );
        let q = buy(
            ctx.accounts.market.virtual_sol,
            ctx.accounts.market.virtual_tokens,
            amount,
            100,
            false,
        )?;
        require!(
            reference_out > 0
                && min_out >= mul_div(reference_out, 9900, 10000)?
                && q.output >= min_out,
            Fault::Slippage
        );
        let mint = ctx.accounts.market.mint;
        let bump = [ctx.accounts.market.bump];
        let seeds: &[&[u8]] = &[b"market", mint.as_ref(), &bump];
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.inventory.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            q.output,
        )?;
        // Complete token CPIs before changing custody lamports.
        if incentives {
            ctx.accounts.incentives.amount = sub(ctx.accounts.incentives.amount, q.gross)?;
            move_sol(
                &ctx.accounts.incentives.to_account_info(),
                &ctx.accounts.market.to_account_info(),
                q.gross,
            )?;
        } else {
            ctx.accounts.market.buyback = sub(ctx.accounts.market.buyback, q.gross)?;
        }
        apply_buy(&mut ctx.accounts.market, &q)?;
        ctx.accounts.market.last_buyback = now;
        allocate(
            &mut ctx.accounts.market,
            &mut ctx.accounts.config,
            &mut ctx.accounts.raffle,
            &mut ctx.accounts.holders,
            &q.fees,
            now,
        )?;
        emit_cpi!(BoughtBack {
            mint,
            sol: q.gross,
            tokens: q.output,
            time: now,
            incentives
        });
        Ok(())
    }
    pub fn withdraw_platform(ctx: Context<Platform>, amount: u64) -> Result<()> {
        ctx.accounts.config.platform = sub(ctx.accounts.config.platform, amount)?;
        move_sol(
            &ctx.accounts.config.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
            amount,
        )
    }
}

fn pay<'a>(from: &AccountInfo<'a>, to: &AccountInfo<'a>, amount: u64) -> Result<()> {
    if amount > 0 {
        invoke(
            &system_instruction::transfer(from.key, to.key, amount),
            &[from.clone(), to.clone()],
        )?;
    }
    Ok(())
}
fn move_sol(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let minimum = Rent::get()?.minimum_balance(from.data_len());
    require!(
        from.lamports().saturating_sub(minimum) >= amount,
        Fault::Insufficient
    );
    **from.try_borrow_mut_lamports()? = sub(from.lamports(), amount)?;
    **to.try_borrow_mut_lamports()? = add(to.lamports(), amount)?;
    Ok(())
}
fn apply_buy(m: &mut Market, q: &Quote) -> Result<()> {
    m.real_sol = add(m.real_sol, q.gross - q.fees.total)?;
    m.virtual_sol = q.next_sol;
    m.virtual_tokens = q.next_tokens;
    if m.state == 0 && q.next_tokens == MIN_TOKENS {
        m.state = 1;
    }
    Ok(())
}
fn allocate<'info>(
    m: &mut Account<'info, Market>,
    config: &mut Account<'info, Config>,
    raffle: &mut Account<'info, Fund>,
    holders: &mut Account<'info, Fund>,
    f: &Fee,
    now: i64,
) -> Result<()> {
    require!(
        raffle.kind == 0
            && raffle.mint == Pubkey::default()
            && raffle.epoch == epoch(now)
            && holders.kind == 1
            && holders.mint == m.mint
            && holders.epoch == epoch(now),
        Fault::Invalid
    );
    let locked = if now < m.fee_cliff {
        mul_div(f.creator, m.routing.locked as u64, BPS)?
    } else {
        0
    };
    let holder = mul_div(f.creator, m.routing.holders as u64, BPS)?;
    let bb = mul_div(f.creator, m.routing.buyback as u64, BPS)?;
    m.direct = add(m.direct, f.creator - locked - holder - bb)?;
    m.locked = add(m.locked, locked)?;
    m.buyback = add(m.buyback, bb)?;
    config.platform = add(config.platform, f.platform)?;
    raffle.amount = add(raffle.amount, f.raffle)?;
    holders.amount = add(holders.amount, holder)?;
    move_sol(&m.to_account_info(), &config.to_account_info(), f.platform)?;
    move_sol(&m.to_account_info(), &raffle.to_account_info(), f.raffle)?;
    move_sol(&m.to_account_info(), &holders.to_account_info(), holder)?;
    emit!(FeesAllocated {
        mint: m.mint,
        time: now,
        creator: f.creator,
        locked,
        holders: holder,
        buyback: bb,
        platform: f.platform,
        raffle: f.raffle
    });
    Ok(())
}
fn transfer_tokens<'info>(
    m: &Account<'info, Market>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let mint = m.mint;
    let bump = [m.bump];
    let seeds: &[&[u8]] = &[b"market", mint.as_ref(), &bump];
    token::transfer(
        CpiContext::new_with_signer(
            program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: m.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Routing {
    pub direct: u16,
    pub locked: u16,
    pub holders: u16,
    pub buyback: u16,
}
impl Routing {
    fn validate(&self, cliff: i64, now: i64) -> Result<()> {
        require!(
            self.direct as u32 + self.locked as u32 + self.holders as u32 + self.buyback as u32
                == 10000
                && (self.locked == 0 || cliff > now),
            Fault::Invalid
        );
        Ok(())
    }
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateArgs {
    pub name: String,
    pub symbol: String,
    pub description: String,
    pub image_uri: String,
    pub routing: Routing,
    pub fee_cliff: i64,
}
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub finalizer: Pubkey,
    pub keeper: Pubkey,
    pub genesis: [u8; 32],
    pub platform: u64,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub launched_at: i64,
    pub state: u8,
    pub virtual_sol: u64,
    pub virtual_tokens: u64,
    pub real_sol: u64,
    pub direct: u64,
    pub locked: u64,
    pub buyback: u64,
    pub fee_cliff: i64,
    pub routing: Routing,
    pub last_buyback: i64,
    pub bump: u8,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(280)]
    pub description: String,
    #[max_len(256)]
    pub image_uri: String,
}
#[account]
#[derive(InitSpace)]
pub struct Fund {
    pub kind: u8,
    pub mint: Pubkey,
    pub epoch: u64,
    pub amount: u64,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Commitment {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub start: i64,
    pub unlock: i64,
    pub token_asset: bool,
    pub withdrawn: bool,
    pub nonce: u64,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Distribution {
    pub epoch: u64,
    pub kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub claimed: u64,
    pub snapshot: [u8; 32],
    pub root: [u8; 32],
    pub committed_at: i64,
    pub beacon_after: i64,
    pub drand_round: u64,
    pub signature_hash: [u8; 32],
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init,payer=authority,space=8+Config::INIT_SPACE,seeds=[b"config"],bump)]
    pub config: Account<'info, Config>,
    #[account(constraint=program.programdata_address()?==Some(program_data.key()))]
    pub program: Program<'info, crate::program::Waffles>,
    #[account(constraint=program_data.upgrade_authority_address==Some(authority.key()) @ Fault::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Create<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init,payer=creator,mint::decimals=6,mint::authority=market)]
    pub mint: Account<'info, Mint>,
    #[account(init,payer=creator,space=8+Market::INIT_SPACE,seeds=[b"market",mint.key().as_ref()],bump)]
    pub market: Account<'info, Market>,
    #[account(init,payer=creator,token::mint=mint,token::authority=market,seeds=[b"inventory",mint.key().as_ref()],bump)]
    pub inventory: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Accounts)]
#[instruction(kind:u8,mint:Pubkey,epoch_id:u64)]
pub struct InitFund<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed,payer=payer,space=8+Fund::INIT_SPACE,seeds=[b"fund".as_ref(),&[kind],mint.as_ref(),&epoch_id.to_le_bytes()],bump)]
    pub fund: Account<'info, Fund>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"market",mint.key().as_ref()],bump=market.bump,has_one=mint)]
    pub market: Account<'info, Market>,
    #[account(mut,seeds=[b"inventory",mint.key().as_ref()],bump,token::mint=mint,token::authority=market)]
    pub inventory: Account<'info, TokenAccount>,
    #[account(init_if_needed,payer=trader,associated_token::mint=mint,associated_token::authority=trader)]
    pub trader_tokens: Account<'info, TokenAccount>,
    #[account(mut,seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"fund".as_ref(),&[0],Pubkey::default().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=raffle.bump)]
    pub raffle: Account<'info, Fund>,
    #[account(mut,seeds=[b"fund".as_ref(),&[1],mint.key().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=holders.bump)]
    pub holders: Account<'info, Fund>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct InitialBuy<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"market",mint.key().as_ref()],bump=market.bump,has_one=mint,has_one=creator)]
    pub market: Account<'info, Market>,
    #[account(mut,seeds=[b"inventory",mint.key().as_ref()],bump,token::mint=mint,token::authority=market)]
    pub inventory: Account<'info, TokenAccount>,
    #[account(init_if_needed,payer=creator,associated_token::mint=mint,associated_token::authority=creator)]
    pub creator_tokens: Account<'info, TokenAccount>,
    #[account(mut,seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"fund".as_ref(),&[0],Pubkey::default().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=raffle.bump)]
    pub raffle: Account<'info, Fund>,
    #[account(mut,seeds=[b"fund".as_ref(),&[1],mint.key().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=holders.bump)]
    pub holders: Account<'info, Fund>,
    /// CHECK: canonical instructions sysvar, parsed with checked Solana helpers.
    #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Graduate<'info> {
    #[account(mut,seeds=[b"market",market.mint.as_ref()],bump=market.bump)]
    pub market: Account<'info, Market>,
    #[account(seeds=[b"inventory",market.mint.as_ref()],bump,token::authority=market,constraint=inventory.mint==market.mint)]
    pub inventory: Account<'info, TokenAccount>,
}
#[derive(Accounts)]
pub struct Creator<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut,seeds=[b"market",market.mint.as_ref()],bump=market.bump,has_one=creator)]
    pub market: Account<'info, Market>,
}
#[event_cpi]
#[derive(Accounts)]
#[instruction(nonce:u64)]
pub struct Lock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"market",mint.key().as_ref()],bump=market.bump,has_one=mint)]
    pub market: Account<'info, Market>,
    #[account(init,payer=owner,space=8+Commitment::INIT_SPACE,seeds=[b"lock",owner.key().as_ref(),mint.key().as_ref(),&nonce.to_le_bytes()],bump)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=owner)]
    pub owner_tokens: Account<'info, TokenAccount>,
    #[account(init,payer=owner,token::mint=mint,token::authority=commitment,seeds=[b"locked-tokens",commitment.key().as_ref()],bump)]
    pub lock_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"lock",owner.key().as_ref(),mint.key().as_ref(),&commitment.nonce.to_le_bytes()],bump=commitment.bump,has_one=owner,has_one=mint)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=owner)]
    pub owner_tokens: Account<'info, TokenAccount>,
    #[account(mut,seeds=[b"locked-tokens",commitment.key().as_ref()],bump,token::mint=mint,token::authority=commitment)]
    pub lock_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
#[event_cpi]
#[derive(Accounts)]
#[instruction(epoch_id:u64,kind:u8,mint:Pubkey)]
pub struct Prepare<'info> {
    #[account(mut,address=config.finalizer)]
    pub finalizer: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"fund".as_ref(),&[source.kind],source.mint.as_ref(),&source.epoch.to_le_bytes()],bump=source.bump)]
    pub source: Account<'info, Fund>,
    #[account(init,payer=finalizer,space=8+Distribution::INIT_SPACE,seeds=[b"distribution".as_ref(),&[kind],mint.as_ref(),&epoch_id.to_le_bytes()],bump)]
    pub distribution: Account<'info, Distribution>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(address=config.finalizer)]
    pub finalizer: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"distribution".as_ref(),&[distribution.kind],distribution.mint.as_ref(),&distribution.epoch.to_le_bytes()],bump=distribution.bump)]
    pub distribution: Account<'info, Distribution>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"distribution".as_ref(),&[distribution.kind],distribution.mint.as_ref(),&distribution.epoch.to_le_bytes()],bump=distribution.bump)]
    pub distribution: Account<'info, Distribution>,
    #[account(init,payer=wallet,space=8+Receipt::INIT_SPACE,seeds=[b"receipt",distribution.key().as_ref(),wallet.key().as_ref()],bump)]
    pub receipt: Account<'info, Receipt>,
    pub system_program: Program<'info, System>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct MoveFund<'info> {
    #[account(address=config.finalizer)]
    pub finalizer: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"fund".as_ref(),&[source.kind],source.mint.as_ref(),&source.epoch.to_le_bytes()],bump=source.bump)]
    pub source: Account<'info, Fund>,
    #[account(mut,seeds=[b"fund".as_ref(),&[destination.kind],destination.mint.as_ref(),&destination.epoch.to_le_bytes()],bump=destination.bump,constraint=destination.mint==source.mint,constraint=source.key()!=destination.key())]
    pub destination: Account<'info, Fund>,
}
#[event_cpi]
#[derive(Accounts)]
pub struct Buyback<'info> {
    #[account(address=config.keeper)]
    pub keeper: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"market",mint.key().as_ref()],bump=market.bump,has_one=mint)]
    pub market: Account<'info, Market>,
    #[account(mut,seeds=[b"inventory",mint.key().as_ref()],bump,token::mint=mint,token::authority=market)]
    pub inventory: Account<'info, TokenAccount>,
    #[account(mut,seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut,seeds=[b"fund".as_ref(),&[0],Pubkey::default().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=raffle.bump)]
    pub raffle: Account<'info, Fund>,
    #[account(mut,seeds=[b"fund".as_ref(),&[1],mint.key().as_ref(),&epoch(Clock::get()?.unix_timestamp).to_le_bytes()],bump=holders.bump)]
    pub holders: Account<'info, Fund>,
    #[account(mut,seeds=[b"fund".as_ref(),&[2],Pubkey::default().as_ref(),&0u64.to_le_bytes()],bump=incentives.bump)]
    pub incentives: Account<'info, Fund>,
    pub token_program: Program<'info, Token>,
}
#[derive(Accounts)]
pub struct Platform<'info> {
    #[account(mut,address=config.authority)]
    pub authority: Signer<'info>,
    #[account(mut,seeds=[b"config"],bump=config.bump)]
    pub config: Account<'info, Config>,
}

#[event]
pub struct Created {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub time: i64,
    pub args: CreateArgs,
}
#[event]
pub struct Traded {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub buy: bool,
    pub gross: u64,
    pub net: u64,
    pub tokens: u64,
    pub fee: u64,
    pub sol_reserve: u64,
    pub token_reserve: u64,
    pub time: i64,
    pub protocol: bool,
}
#[event]
pub struct FeesAllocated {
    pub mint: Pubkey,
    pub time: i64,
    pub creator: u64,
    pub locked: u64,
    pub holders: u64,
    pub buyback: u64,
    pub platform: u64,
    pub raffle: u64,
}
#[event]
pub struct Graduated {
    pub mint: Pubkey,
    pub time: i64,
    pub sol: u64,
    pub tokens: u64,
}
#[event]
pub struct Locked {
    pub id: Pubkey,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub start: i64,
    pub unlock: i64,
    pub token_asset: bool,
}
#[event]
pub struct Unlocked {
    pub id: Pubkey,
    pub time: i64,
}
#[event]
pub struct DistributionPrepared {
    pub id: Pubkey,
    pub epoch: u64,
    pub kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub snapshot: [u8; 32],
    pub beacon_after: i64,
}
#[event]
pub struct DistributionFinalized {
    pub id: Pubkey,
    pub root: [u8; 32],
    pub drand_round: u64,
    pub signature: Vec<u8>,
}
#[event]
pub struct Claimed {
    pub distribution: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}
#[event]
pub struct FundMoved {
    pub source: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}
#[event]
pub struct BoughtBack {
    pub mint: Pubkey,
    pub sol: u64,
    pub tokens: u64,
    pub time: i64,
    pub incentives: bool,
}
#[error_code]
pub enum Fault {
    #[msg("Invalid parameters")]
    Invalid,
    #[msg("Unauthorized account")]
    Unauthorized,
    #[msg("Checked arithmetic overflow")]
    Overflow,
    #[msg("Insufficient accounted funds")]
    Insufficient,
    #[msg("Minimum output not met")]
    Slippage,
    #[msg("No output")]
    ZeroOutput,
    #[msg("Curve complete; graduation pending")]
    Complete,
    #[msg("Commitment has not unlocked or was withdrawn")]
    Locked,
    #[msg("Invalid claim proof")]
    Proof,
}
