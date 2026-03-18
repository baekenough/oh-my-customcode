//! Agent domain scope filtering.
//!
//! Maps `subagent_type` identifiers to their logical domain for hook-level routing.
//! All matching is prefix-based and O(1) per domain lookup.

/// Domain categories that agents belong to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Domain {
    Backend,
    Frontend,
    DataEngineering,
    DevOps,
    Database,
    Management,
    Security,
    Qa,
    Architecture,
    Universal,
}

impl Domain {
    /// Returns the canonical string representation of the domain.
    pub fn as_str(&self) -> &'static str {
        match self {
            Domain::Backend => "backend",
            Domain::Frontend => "frontend",
            Domain::DataEngineering => "data-engineering",
            Domain::DevOps => "devops",
            Domain::Database => "database",
            Domain::Management => "management",
            Domain::Security => "security",
            Domain::Qa => "qa",
            Domain::Architecture => "architecture",
            Domain::Universal => "universal",
        }
    }
}

impl std::str::FromStr for Domain {
    type Err = ();

    /// Parses a domain from its string representation.
    ///
    /// # Examples
    ///
    /// ```
    /// use cli_native::scope_filter::Domain;
    /// use std::str::FromStr;
    ///
    /// assert_eq!(Domain::from_str("backend"), Ok(Domain::Backend));
    /// assert_eq!(Domain::from_str("database"), Ok(Domain::Database));
    /// assert!(Domain::from_str("unknown").is_err());
    /// ```
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "backend" => Ok(Domain::Backend),
            "frontend" => Ok(Domain::Frontend),
            "data-engineering" => Ok(Domain::DataEngineering),
            "devops" => Ok(Domain::DevOps),
            "database" => Ok(Domain::Database),
            "management" => Ok(Domain::Management),
            "security" => Ok(Domain::Security),
            "qa" => Ok(Domain::Qa),
            "architecture" => Ok(Domain::Architecture),
            "universal" => Ok(Domain::Universal),
            _ => Err(()),
        }
    }
}

/// Domain prefix rules: (prefix, domain).
/// Order matters — more specific prefixes first.
const DOMAIN_PREFIXES: &[(&str, Domain)] = &[
    ("lang-", Domain::Backend),
    ("be-", Domain::Backend),
    ("fe-", Domain::Frontend),
    ("de-", Domain::DataEngineering),
    ("infra-", Domain::DevOps),
    ("db-", Domain::Database),
    ("mgr-", Domain::Management),
    ("sys-", Domain::Management),
    ("sec-", Domain::Security),
    ("qa-", Domain::Qa),
    ("arch-", Domain::Architecture),
    ("tool-", Domain::Universal),
];

/// Resolves the domain of an agent given its `subagent_type`.
///
/// Returns `None` if the agent type does not match any known prefix.
///
/// # Examples
///
/// ```
/// use cli_native::scope_filter::{resolve_domain, Domain};
///
/// assert_eq!(resolve_domain("lang-golang-expert"), Some(Domain::Backend));
/// assert_eq!(resolve_domain("fe-vercel-agent"), Some(Domain::Frontend));
/// assert_eq!(resolve_domain("de-airflow-expert"), Some(Domain::DataEngineering));
/// assert_eq!(resolve_domain("db-postgres-expert"), Some(Domain::Database));
/// assert_eq!(resolve_domain("unknown-agent"), None);
/// ```
pub fn resolve_domain(agent_type: &str) -> Option<Domain> {
    DOMAIN_PREFIXES
        .iter()
        .find(|(prefix, _)| agent_type.starts_with(prefix))
        .map(|(_, domain)| *domain)
}

/// Checks whether an agent's `subagent_type` matches a given domain string.
///
/// The `domain` parameter is matched case-insensitively against canonical domain names.
///
/// # Examples
///
/// ```
/// use cli_native::scope_filter::matches_domain;
///
/// assert!(matches_domain("lang-golang-expert", "backend"));
/// assert!(matches_domain("be-fastapi-expert", "backend"));
/// assert!(matches_domain("db-postgres-expert", "database"));
/// assert!(!matches_domain("fe-vercel-agent", "backend"));
/// assert!(!matches_domain("unknown-type", "backend"));
/// ```
pub fn matches_domain(agent_type: &str, domain: &str) -> bool {
    match resolve_domain(agent_type) {
        Some(resolved) => resolved.as_str().eq_ignore_ascii_case(domain),
        None => false,
    }
}

/// Filters a slice of agent type strings to only those matching the given domain.
///
/// # Examples
///
/// ```
/// use cli_native::scope_filter::filter_by_domain;
///
/// let agents = vec!["lang-golang-expert", "fe-vercel-agent", "be-fastapi-expert", "de-spark-expert"];
/// let backend = filter_by_domain(&agents, "backend");
/// assert_eq!(backend, vec!["lang-golang-expert", "be-fastapi-expert"]);
/// ```
pub fn filter_by_domain(agents: &[&str], domain: &str) -> Vec<String> {
    agents
        .iter()
        .filter(|&&agent| matches_domain(agent, domain))
        .map(|&agent| agent.to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_domain_backend() {
        assert_eq!(resolve_domain("lang-golang-expert"), Some(Domain::Backend));
        assert_eq!(resolve_domain("lang-python-expert"), Some(Domain::Backend));
        assert_eq!(resolve_domain("lang-rust-expert"), Some(Domain::Backend));
        assert_eq!(resolve_domain("be-fastapi-expert"), Some(Domain::Backend));
        assert_eq!(resolve_domain("be-nestjs-expert"), Some(Domain::Backend));
    }

    #[test]
    fn test_resolve_domain_frontend() {
        assert_eq!(resolve_domain("fe-vercel-agent"), Some(Domain::Frontend));
        assert_eq!(resolve_domain("fe-vuejs-agent"), Some(Domain::Frontend));
        assert_eq!(resolve_domain("fe-svelte-agent"), Some(Domain::Frontend));
        assert_eq!(resolve_domain("fe-flutter-agent"), Some(Domain::Frontend));
    }

    #[test]
    fn test_resolve_domain_data_engineering() {
        assert_eq!(
            resolve_domain("de-airflow-expert"),
            Some(Domain::DataEngineering)
        );
        assert_eq!(
            resolve_domain("de-spark-expert"),
            Some(Domain::DataEngineering)
        );
        assert_eq!(
            resolve_domain("de-kafka-expert"),
            Some(Domain::DataEngineering)
        );
    }

    #[test]
    fn test_resolve_domain_devops() {
        assert_eq!(resolve_domain("infra-docker-expert"), Some(Domain::DevOps));
        assert_eq!(resolve_domain("infra-aws-expert"), Some(Domain::DevOps));
    }

    #[test]
    fn test_resolve_domain_database() {
        assert_eq!(
            resolve_domain("db-postgres-expert"),
            Some(Domain::Database)
        );
        assert_eq!(resolve_domain("db-redis-expert"), Some(Domain::Database));
        assert_eq!(
            resolve_domain("db-supabase-expert"),
            Some(Domain::Database)
        );
    }

    #[test]
    fn test_resolve_domain_management() {
        assert_eq!(resolve_domain("mgr-creator"), Some(Domain::Management));
        assert_eq!(resolve_domain("mgr-gitnerd"), Some(Domain::Management));
        assert_eq!(resolve_domain("sys-memory-keeper"), Some(Domain::Management));
        assert_eq!(resolve_domain("sys-naggy"), Some(Domain::Management));
    }

    #[test]
    fn test_resolve_domain_security() {
        assert_eq!(resolve_domain("sec-codeql-expert"), Some(Domain::Security));
    }

    #[test]
    fn test_resolve_domain_qa() {
        assert_eq!(resolve_domain("qa-planner"), Some(Domain::Qa));
        assert_eq!(resolve_domain("qa-writer"), Some(Domain::Qa));
        assert_eq!(resolve_domain("qa-engineer"), Some(Domain::Qa));
    }

    #[test]
    fn test_resolve_domain_architecture() {
        assert_eq!(
            resolve_domain("arch-documenter"),
            Some(Domain::Architecture)
        );
        assert_eq!(
            resolve_domain("arch-speckit-agent"),
            Some(Domain::Architecture)
        );
    }

    #[test]
    fn test_resolve_domain_universal() {
        assert_eq!(resolve_domain("tool-npm-expert"), Some(Domain::Universal));
        assert_eq!(resolve_domain("tool-optimizer"), Some(Domain::Universal));
        assert_eq!(resolve_domain("tool-bun-expert"), Some(Domain::Universal));
    }

    #[test]
    fn test_resolve_domain_unknown() {
        assert_eq!(resolve_domain("unknown-agent"), None);
        assert_eq!(resolve_domain(""), None);
        assert_eq!(resolve_domain("general-purpose"), None);
    }

    #[test]
    fn test_matches_domain() {
        assert!(matches_domain("lang-golang-expert", "backend"));
        assert!(matches_domain("be-fastapi-expert", "backend"));
        assert!(matches_domain("db-postgres-expert", "database"));
        assert!(!matches_domain("fe-vercel-agent", "backend"));
        assert!(!matches_domain("unknown", "backend"));
    }

    #[test]
    fn test_matches_domain_case_insensitive() {
        assert!(matches_domain("lang-golang-expert", "Backend"));
        assert!(matches_domain("lang-golang-expert", "BACKEND"));
    }

    #[test]
    fn test_filter_by_domain() {
        let agents = vec![
            "lang-golang-expert",
            "fe-vercel-agent",
            "be-fastapi-expert",
            "de-spark-expert",
            "mgr-gitnerd",
        ];
        let backend = filter_by_domain(&agents, "backend");
        assert_eq!(backend, vec!["lang-golang-expert", "be-fastapi-expert"]);

        let frontend = filter_by_domain(&agents, "frontend");
        assert_eq!(frontend, vec!["fe-vercel-agent"]);

        let de = filter_by_domain(&agents, "data-engineering");
        assert_eq!(de, vec!["de-spark-expert"]);
    }

    #[test]
    fn test_filter_by_domain_database() {
        let agents = vec![
            "db-supabase-expert",
            "db-postgres-expert",
            "db-redis-expert",
            "infra-docker-expert",
        ];
        let database = filter_by_domain(&agents, "database");
        assert_eq!(
            database,
            vec!["db-supabase-expert", "db-postgres-expert", "db-redis-expert"]
        );
        let devops = filter_by_domain(&agents, "devops");
        assert_eq!(devops, vec!["infra-docker-expert"]);
    }

    #[test]
    fn test_filter_by_domain_empty_result() {
        let agents = vec!["lang-golang-expert", "fe-vercel-agent"];
        let result = filter_by_domain(&agents, "qa");
        assert!(result.is_empty());
    }

    #[test]
    fn test_filter_by_domain_empty_input() {
        let agents: Vec<&str> = vec![];
        let result = filter_by_domain(&agents, "backend");
        assert!(result.is_empty());
    }

    #[test]
    fn test_domain_as_str_roundtrip() {
        let domains = [
            Domain::Backend,
            Domain::Frontend,
            Domain::DataEngineering,
            Domain::DevOps,
            Domain::Database,
            Domain::Management,
            Domain::Security,
            Domain::Qa,
            Domain::Architecture,
            Domain::Universal,
        ];
        for domain in &domains {
            let s = domain.as_str();
            let parsed = s.parse::<Domain>().expect("round-trip should succeed");
            assert_eq!(*domain, parsed);
        }
    }

    #[test]
    fn test_domain_from_str_ok() {
        assert_eq!("backend".parse::<Domain>(), Ok(Domain::Backend));
        assert_eq!("database".parse::<Domain>(), Ok(Domain::Database));
        assert_eq!("devops".parse::<Domain>(), Ok(Domain::DevOps));
    }

    #[test]
    fn test_domain_from_str_err() {
        assert!("unknown".parse::<Domain>().is_err());
        assert!("".parse::<Domain>().is_err());
    }

    #[test]
    fn test_domain_is_copy() {
        let d = Domain::Backend;
        let _d2 = d; // moves if not Copy
        let _d3 = d; // compiles only if Copy is derived
    }
}
