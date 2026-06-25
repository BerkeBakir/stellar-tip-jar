#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Total,
    Count,
    Donors,
    DonorTotal(Address),
}

#[contract]
pub struct TipJar;

#[contractimpl]
impl TipJar {
    /// Record a tip: validate, update totals, emit a `tip` event.
    pub fn donate(env: Env, donor: Address, amount: i128, message: String) {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        let len = message.len();
        if len == 0 || len > 140 {
            panic!("message length must be 1..=140");
        }

        let storage = env.storage().persistent();

        // Per-donor running total; track distinct donors on first tip.
        let donor_key = DataKey::DonorTotal(donor.clone());
        let prev: i128 = storage.get(&donor_key).unwrap_or(0);
        if prev == 0 {
            let mut donors: Vec<Address> =
                storage.get(&DataKey::Donors).unwrap_or(Vec::new(&env));
            donors.push_back(donor.clone());
            storage.set(&DataKey::Donors, &donors);
        }
        storage.set(&donor_key, &(prev + amount));

        // Global total + count.
        let total: i128 = storage.get(&DataKey::Total).unwrap_or(0);
        storage.set(&DataKey::Total, &(total + amount));
        let count: u32 = storage.get(&DataKey::Count).unwrap_or(0);
        storage.set(&DataKey::Count, &(count + 1));

        // Event: topics ("tip", donor), data (amount, message).
        env.events()
            .publish((symbol_short!("tip"), donor.clone()), (amount, message));
    }

    pub fn get_leaderboard(env: Env) -> Vec<(Address, i128)> {
        let storage = env.storage().persistent();
        let donors: Vec<Address> = storage.get(&DataKey::Donors).unwrap_or(Vec::new(&env));
        let mut out: Vec<(Address, i128)> = Vec::new(&env);
        for d in donors.iter() {
            let t: i128 = storage.get(&DataKey::DonorTotal(d.clone())).unwrap_or(0);
            out.push_back((d, t));
        }
        out
    }

    pub fn get_total(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::Total).unwrap_or(0)
    }

    pub fn get_tip_count(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::Count).unwrap_or(0)
    }
}

mod test;
