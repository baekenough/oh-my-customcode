"""Hierarchical context loading — load summaries first, expand on demand."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class LoadedContext:
    """Result of hierarchical context loading.

    Attributes:
        agent_summary: Summary of the agent.
        skill_summaries: List of skill summary strings.
        rule_summaries: List of rule summary strings.
        expanded_rules: Full content of expanded rules.
        expanded_skills: Full content of expanded skills.
        total_tokens: Estimated total tokens used.
        loading_levels: Which hierarchical levels were loaded.
    """

    agent_summary: str = ""
    skill_summaries: list[str] = field(default_factory=list)
    rule_summaries: list[str] = field(default_factory=list)
    expanded_rules: list[str] = field(default_factory=list)
    expanded_skills: list[str] = field(default_factory=list)
    total_tokens: int = 0
    loading_levels: list[int] = field(default_factory=list)

    def to_context_string(self) -> str:
        """Combine all loaded context into a single string for injection.

        Returns:
            Formatted context string ready for LLM injection.
        """
        parts = []
        if self.agent_summary:
            parts.append(f"## Agent\n{self.agent_summary}")
        if self.rule_summaries:
            parts.append(
                f"## Applicable Rules\n" + "\n".join(f"- {r}" for r in self.rule_summaries)
            )
        if self.expanded_rules:
            parts.append(f"## Rule Details\n" + "\n\n".join(self.expanded_rules))
        if self.skill_summaries:
            parts.append(
                f"## Skills\n" + "\n".join(f"- {s}" for s in self.skill_summaries)
            )
        if self.expanded_skills:
            parts.append(f"## Skill Details\n" + "\n\n".join(self.expanded_skills))
        return "\n\n".join(parts)


class HierarchicalLoader:
    """Load context hierarchically based on token budget.

    Loading levels:
      Level 0: Category summaries (~500 tokens)
      Level 1: Relevant entity summaries (~800 tokens)
      Level 2: Selected rules full content (~1500 tokens)
      Level 3: Skill summaries (~600 tokens)
      Level 4: Skill full content on-demand (~2000 tokens)

    Attributes:
        ontology: Ontology instance for querying entities.
        graph: OntologyGraph instance for traversing dependencies.
        rules_dir: Optional path to directory containing rule markdown files.
    """

    def __init__(self, ontology, graph, rules_dir: str | Path = None):
        """Initialize hierarchical loader.

        Args:
            ontology: Ontology instance
            graph: OntologyGraph instance
            rules_dir: Optional path to rules directory for expansion
        """
        self.ontology = ontology
        self.graph = graph
        self.rules_dir = Path(rules_dir) if rules_dir else None

    def load_for_agent(self, agent_name: str, token_budget: int = 5000) -> LoadedContext:
        """Load hierarchical context for a specific agent within token budget.

        This method loads context in levels, stopping when the budget is exhausted:
        1. Agent summary
        2. Rule summaries (including MUST rules)
        3. Expanded rule content (top priority rules)
        4. Skill summaries

        Args:
            agent_name: Name of the agent to load context for.
            token_budget: Maximum tokens to use.

        Returns:
            LoadedContext with all loaded information.
        """
        context = LoadedContext()
        remaining_budget = token_budget

        agent = self.ontology.get_agent(agent_name)
        if not agent:
            return context

        # Level 0: Agent summary (~50 tokens)
        context.agent_summary = f"{agent.name} ({agent.agent_class}): {agent.summary}"
        remaining_budget -= self._estimate_tokens(context.agent_summary)
        context.loading_levels.append(0)

        # Level 1: Rule summaries
        deps = self.graph.get_agent_dependencies(agent_name)
        rule_names = deps.get("rules", [])

        # Always include MUST rules that apply to all
        for rule in self.ontology.rules.values():
            if rule.rule_class == "MustRule" and "all" in rule.applies_to:
                if rule.name not in rule_names:
                    rule_names.append(rule.name)

        for rname in rule_names:
            rule = self.ontology.get_rule(rname)
            if rule:
                summary = f"[{rule.name}] {rule.title}: {rule.summary}"
                tokens = self._estimate_tokens(summary)
                if tokens <= remaining_budget:
                    context.rule_summaries.append(summary)
                    remaining_budget -= tokens
        context.loading_levels.append(1)

        # Level 2: Expand top rules (highest token estimate first = most important)
        if remaining_budget > 500 and self.rules_dir:
            expandable = sorted(
                [self.ontology.get_rule(r) for r in rule_names if self.ontology.get_rule(r)],
                key=lambda r: r.token_estimate,
                reverse=True,
            )
            for rule in expandable[:3]:  # Top 3 rules
                if rule.filename and rule.token_estimate <= remaining_budget:
                    full_path = self.rules_dir / rule.filename
                    if full_path.exists():
                        content = full_path.read_text()
                        context.expanded_rules.append(content)
                        remaining_budget -= rule.token_estimate
            context.loading_levels.append(2)

        # Level 3: Skill summaries
        skill_names = deps.get("skills", [])
        for sname in skill_names:
            skill = self.ontology.get_skill(sname)
            if skill:
                summary = f"{skill.name}: {skill.summary}"
                tokens = self._estimate_tokens(summary)
                if tokens <= remaining_budget:
                    context.skill_summaries.append(summary)
                    remaining_budget -= tokens
        context.loading_levels.append(3)

        # Level 4: Expand skills if budget allows (on-demand, not always)
        # This would be triggered explicitly, not automatically

        context.total_tokens = token_budget - remaining_budget
        return context

    def load_for_query(
        self, query: str, routing_result, token_budget: int = 5000
    ) -> LoadedContext:
        """Load context based on a routing result (from SemanticRouter).

        Args:
            query: Original user query (currently unused, for future enhancement).
            routing_result: RoutingResult from SemanticRouter.
            token_budget: Maximum tokens to use.

        Returns:
            LoadedContext for the routed agent.
        """
        if not routing_result.agent:
            return LoadedContext()
        return self.load_for_agent(routing_result.agent, token_budget)

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimation: words * 1.3.

        Args:
            text: Text to estimate tokens for.

        Returns:
            Estimated token count.
        """
        return int(len(text.split()) * 1.3)
