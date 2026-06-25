#![cfg(test)]
use super::{TipJar, TipJarClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, String,
};

fn setup() -> (Env, TipJarClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TipJar, ());
    let client = TipJarClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn donate_updates_totals_and_count() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &100, &String::from_str(&env, "thanks!"));
    assert_eq!(client.get_total(), 100);
    assert_eq!(client.get_tip_count(), 1);
    let board = client.get_leaderboard();
    assert_eq!(board.len(), 1);
    assert_eq!(board.get(0).unwrap(), (donor.clone(), 100));
}

#[test]
fn same_donor_accumulates_without_duplicate_row() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &100, &String::from_str(&env, "one"));
    client.donate(&donor, &50, &String::from_str(&env, "two"));
    assert_eq!(client.get_total(), 150);
    assert_eq!(client.get_tip_count(), 2);
    let board = client.get_leaderboard();
    assert_eq!(board.len(), 1);
    assert_eq!(board.get(0).unwrap(), (donor, 150));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn rejects_non_positive_amount() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &0, &String::from_str(&env, "nope"));
}

#[test]
#[should_panic(expected = "message length must be 1..=140")]
fn rejects_empty_message() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &10, &String::from_str(&env, ""));
}

#[test]
fn emits_tip_event() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &42, &String::from_str(&env, "hi"));
    let events = env.events().all();
    assert_eq!(events.len(), 1);
}
