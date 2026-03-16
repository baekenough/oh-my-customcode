"""Load and query YAML ontology files."""

import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentInfo:
    """Information about an agent from the ontology."""

    name: str
    agent_class: str
    description: str
    model: str
    memory: Optional[str] = None
    effort: Optional[str] = None
    skills: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    summary: str = ""
    keywords: list[str] = field(default_factory=list)
    file_patterns: list[str] = field(default_factory=list)


@dataclass
class SkillInfo:
    """Information about a skill from the ontology."""

    name: str
    skill_class: str
    description: str
    user_invocable: bool = True
    model_invocable: bool = True
    scope: str = "core"  # core | harness | package — keep in sync with src/core/scope-filter.ts SkillScope
    summary: str = ""
    keywords: list[str] = field(default_factory=list)
    rule_references: list[str] = field(default_factory=list)
    routes_to: list[str] = field(default_factory=list)


@dataclass
class RuleInfo:
    """Information about a rule from the ontology."""

    name: str
    rule_class: str
    categories: list[str] = field(default_factory=list)
    title: str = ""
    filename: str = ""
    summary: str = ""
    keywords: list[str] = field(default_factory=list)
    token_estimate: int = 0
    applies_to: list[str] = field(default_factory=list)


class Ontology:
    """Load and query the oh-my-customcode ontology.

    This class loads YAML ontology files (agents.yaml, skills.yaml, rules.yaml)
    and provides methods to query agents, skills, and rules.

    Attributes:
        ontology_dir: Path to the directory containing ontology YAML files.
        agents: Dictionary mapping agent names to AgentInfo objects.
        skills: Dictionary mapping skill names to SkillInfo objects.
        rules: Dictionary mapping rule names (e.g., "R007") to RuleInfo objects.
        agent_classes: Dictionary mapping agent class names to lists of agent names.
        skill_classes: Dictionary mapping skill class names to lists of skill names.
        rule_categories: Dictionary of rule category information.
    """

    def __init__(self, ontology_dir: str | Path):
        """Initialize ontology loader.

        Args:
            ontology_dir: Path to directory containing agents.yaml, skills.yaml, rules.yaml
        """
        self.ontology_dir = Path(ontology_dir)
        self.agents: dict[str, AgentInfo] = {}
        self.skills: dict[str, SkillInfo] = {}
        self.rules: dict[str, RuleInfo] = {}
        self.agent_classes: dict[str, list[str]] = {}
        self.skill_classes: dict[str, list[str]] = {}
        self.rule_categories: dict[str, dict] = {}
        self._load()

    def _load(self):
        """Load all ontology YAML files."""
        self._load_agents()
        self._load_skills()
        self._load_rules()

    def _load_agents(self):
        """Parse agents.yaml and populate agents and agent_classes."""
        path = self.ontology_dir / "agents.yaml"
        if not path.exists():
            return

        data = yaml.safe_load(path.read_text()) or {}

        # Parse classes section
        for class_name, class_data in data.get("classes", {}).items():
            self.agent_classes[class_name] = class_data.get("agents", [])

        # Parse agents section
        for name, info in data.get("agents", {}).items():
            self.agents[name] = AgentInfo(
                name=name,
                agent_class=info.get("class", ""),
                description=info.get("description", ""),
                model=info.get("model", "sonnet"),
                memory=info.get("memory"),
                effort=info.get("effort"),
                skills=info.get("skills", []),
                tools=info.get("tools", []),
                summary=info.get("summary", ""),
                keywords=info.get("keywords", []),
                file_patterns=info.get("file_patterns", []),
            )

    def _load_skills(self):
        """Parse skills.yaml and populate skills and skill_classes."""
        path = self.ontology_dir / "skills.yaml"
        if not path.exists():
            return

        data = yaml.safe_load(path.read_text()) or {}

        # Parse classes section
        for class_name, class_data in data.get("classes", {}).items():
            self.skill_classes[class_name] = class_data.get("skills", [])

        # Parse skills section
        for name, info in data.get("skills", {}).items():
            self.skills[name] = SkillInfo(
                name=name,
                skill_class=info.get("class", ""),
                description=info.get("description", ""),
                user_invocable=info.get("user_invocable", True),
                model_invocable=info.get("model_invocable", True),
                scope=info.get("scope", "core"),
                summary=info.get("summary", ""),
                keywords=info.get("keywords", []),
                rule_references=info.get("rule_references", []),
                routes_to=info.get("routes_to", []),
            )

    def _load_rules(self):
        """Parse rules.yaml and populate rules and rule_categories."""
        path = self.ontology_dir / "rules.yaml"
        if not path.exists():
            return

        data = yaml.safe_load(path.read_text()) or {}

        # Parse categories section
        self.rule_categories = data.get("categories", {})

        # Parse rules section
        for name, info in data.get("rules", {}).items():
            self.rules[name] = RuleInfo(
                name=name,
                rule_class=info.get("class", ""),
                categories=info.get("categories", []),
                title=info.get("title", ""),
                filename=info.get("filename", ""),
                summary=info.get("summary", ""),
                keywords=info.get("keywords", []),
                token_estimate=info.get("token_estimate", 0),
                applies_to=info.get("applies_to", []),
            )

    def get_agent(self, name: str) -> Optional[AgentInfo]:
        """Get agent information by name.

        Args:
            name: Agent name (e.g., "lang-golang-expert")

        Returns:
            AgentInfo object if found, None otherwise.
        """
        return self.agents.get(name)

    def get_agents_by_class(self, class_name: str) -> list[AgentInfo]:
        """Get all agents of a specific class.

        Args:
            class_name: Agent class name (e.g., "LanguageExpert")

        Returns:
            List of AgentInfo objects for agents in that class.
        """
        names = self.agent_classes.get(class_name, [])
        return [self.agents[n] for n in names if n in self.agents]

    def get_skill(self, name: str) -> Optional[SkillInfo]:
        """Get skill information by name.

        Args:
            name: Skill name (e.g., "go-best-practices")

        Returns:
            SkillInfo object if found, None otherwise.
        """
        return self.skills.get(name)

    def get_rule(self, name: str) -> Optional[RuleInfo]:
        """Get rule information by name.

        Args:
            name: Rule name (e.g., "R007")

        Returns:
            RuleInfo object if found, None otherwise.
        """
        return self.rules.get(name)

    def get_rules_by_category(self, category: str) -> list[RuleInfo]:
        """Get all rules in a specific category.

        Args:
            category: Rule category name (e.g., "agent-design")

        Returns:
            List of RuleInfo objects in that category.
        """
        cat_data = self.rule_categories.get(category, {})
        rule_names = cat_data.get("rules", [])
        return [self.rules[r] for r in rule_names if r in self.rules]

    def search_by_keywords(
        self, keywords: list[str], entity_type: str = "all"
    ) -> list[tuple[str, AgentInfo | SkillInfo | RuleInfo, int]]:
        """Search entities by keyword matching.

        Args:
            keywords: List of keywords to search for.
            entity_type: Type to search ("all", "agent", "skill", or "rule").

        Returns:
            List of tuples (entity_type, entity_object, score) sorted by score descending.
        """
        results = []
        keywords_lower = [k.lower() for k in keywords]

        if entity_type in ("all", "agent"):
            for agent in self.agents.values():
                score = sum(
                    1 for k in keywords_lower if k in [kw.lower() for kw in agent.keywords]
                )
                if score > 0:
                    results.append(("agent", agent, score))

        if entity_type in ("all", "skill"):
            for skill in self.skills.values():
                score = sum(
                    1 for k in keywords_lower if k in [kw.lower() for kw in skill.keywords]
                )
                if score > 0:
                    results.append(("skill", skill, score))

        if entity_type in ("all", "rule"):
            for rule in self.rules.values():
                score = sum(
                    1 for k in keywords_lower if k in [kw.lower() for kw in rule.keywords]
                )
                if score > 0:
                    results.append(("rule", rule, score))

        results.sort(key=lambda x: x[2], reverse=True)
        return results

    def get_agent_context(self, agent_name: str) -> dict:
        """Get complete context for an agent.

        This includes the agent info, all its skills, and all applicable rules
        (both from skills and MUST rules that apply to all).

        Args:
            agent_name: Name of the agent.

        Returns:
            Dictionary with keys: agent, skills, rules, token_estimate.
        """
        agent = self.agents.get(agent_name)
        if not agent:
            return {}

        # Get all skills for this agent
        skills = [self.skills[s] for s in agent.skills if s in self.skills]

        # Collect rules from skill references
        rule_names = set()
        for skill in skills:
            rule_names.update(skill.rule_references)

        # Always include MUST rules that apply to all
        for rule in self.rules.values():
            if rule.rule_class == "MustRule" and "all" in rule.applies_to:
                rule_names.add(rule.name)

        rules = [self.rules[r] for r in rule_names if r in self.rules]

        return {
            "agent": agent,
            "skills": skills,
            "rules": rules,
            "token_estimate": sum(r.token_estimate for r in rules),
        }
