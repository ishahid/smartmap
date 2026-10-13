//! Keeping bugs from closing the app.
//!
//! In Rust, a "panic" is how code gives up when something happens that it
//! didn't expect (an index past the end of a list, say). Our own code returns
//! errors instead, but a library reading a damaged file can still panic: the
//! robustness tests (tests/robustness.rs) found that a scrambled FlatGeobuf
//! file makes the `flatgeobuf` crate panic.
//!
//! Left alone, a panic in a command would close SmartMap and lose unsaved work.
//! [`catch`] turns it into an ordinary error message instead. This only works
//! because the release build keeps Rust's default `panic = "unwind"` (see
//! Cargo.toml); with `panic = "abort"` there would be nothing to catch.

use std::panic::{AssertUnwindSafe, catch_unwind};

/// Runs `work` and returns its result, or an error message if it panicked.
///
/// `AssertUnwindSafe` tells Rust we've thought about what a half-finished
/// `work` might leave behind. Everything we call this on either builds its
/// result from scratch (readers) or only holds a lock for code that can't
/// panic (the tile server), so nothing is left in a broken state.
pub fn catch<T>(work: impl FnOnce() -> T) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(work)).map_err(|panic| {
        // A panic carries its message as a `String` or a `&str`.
        let detail = panic
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| panic.downcast_ref::<&str>().copied())
            .unwrap_or("unknown problem");
        format!("an internal error occurred ({detail})")
    })
}

/// [`catch`] for work that can fail anyway: either way, the error comes back
/// as the text the UI shows. Used by the commands in `commands.rs`.
pub fn catch_error<T, E: std::fmt::Display>(
    work: impl FnOnce() -> Result<T, E>,
) -> Result<T, String> {
    catch(work)?.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_results_through() {
        assert_eq!(catch(|| 2 + 2), Ok(4));
    }

    #[test]
    fn turns_a_panic_into_an_error() {
        let list: Vec<u8> = Vec::new();
        let result = catch(|| list[3]);
        let message = result.unwrap_err();
        assert!(
            message.starts_with("an internal error occurred ("),
            "{message}"
        );
        assert!(message.contains("index out of bounds"), "{message}");
    }

    #[test]
    fn errors_and_panics_both_become_text() {
        assert_eq!(catch_error(|| "7".parse::<u8>()), Ok(7));
        assert_eq!(
            catch_error(|| "x".parse::<u8>()),
            Err("invalid digit found in string".to_string())
        );
        assert!(catch_error(|| -> Result<(), String> { panic!("oops") }).is_err());
    }
}
