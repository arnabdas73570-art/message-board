#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Env, String};

// Storage key for the message
const MSG_KEY: soroban_sdk::Symbol = symbol_short!("MSG");

#[contract]
pub struct MessageBoard;

#[contractimpl]
impl MessageBoard {
    /// Stores a new message on-chain.
    pub fn set_message(env: Env, msg: String) {
        env.storage().instance().set(&MSG_KEY, &msg);
    }

    /// Returns the current stored message.
    /// Panics if no message has been set yet.
    pub fn get_message(env: Env) -> String {
        env.storage()
            .instance()
            .get(&MSG_KEY)
            .expect("No message set yet")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_set_and_get_message() {
        let env = Env::default();
        let contract_id = env.register(MessageBoard, ());
        let client = MessageBoardClient::new(&env, &contract_id);

        // Set a message
        let msg = String::from_str(&env, "Hello Stellar!");
        client.set_message(&msg);

        // Get and verify the message
        let result = client.get_message();
        assert_eq!(result, msg);
    }

    #[test]
    fn test_overwrite_message() {
        let env = Env::default();
        let contract_id = env.register(MessageBoard, ());
        let client = MessageBoardClient::new(&env, &contract_id);

        // Set first message
        let msg1 = String::from_str(&env, "First message");
        client.set_message(&msg1);
        assert_eq!(client.get_message(), msg1);

        // Overwrite with second message
        let msg2 = String::from_str(&env, "Second message");
        client.set_message(&msg2);
        assert_eq!(client.get_message(), msg2);
    }
}
