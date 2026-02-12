"""MCP resource definitions for ontology-rag."""

import json
from pathlib import Path
from typing import Any

import yaml
from mcp.types import Resource

from ontology_rag.ontology import Ontology


class OntologyMCPResources:
    """MCP resource implementations for read-only ontology access.

    Provides 3 resources:
    - ontology://schema — Schema definition with class hierarchies
    - ontology://agent/{name} — Agent detail with skills and rules
    - ontology://rule/{id} — Rule summary or full text
    """

    def __init__(self, ontology: Ontology, ontology_dir: Path):
        self.ontology = ontology
        self.ontology_dir = ontology_dir

    def get_resource_list(self) -> list[Resource]:
        """Return list of available MCP resources."""
        resources = [
            Resource(
                uri="ontology://schema",
                name="Ontology Schema",
                description=(
                    "Schema definition including entity types, relations, "
                    "and class hierarchies"
                ),
                mimeType="application/json",
            ),
        ]

        # Add agent resources
        for agent_name in self.ontology.agents:
            resources.append(
                Resource(
                    uri=f"ontology://agent/{agent_name}",
                    name=f"Agent: {agent_name}",
                    description=f"Details for agent {agent_name}",
                    mimeType="application/json",
                )
            )

        # Add rule resources
        for rule_name in self.ontology.rules:
            resources.append(
                Resource(
                    uri=f"ontology://rule/{rule_name}",
                    name=f"Rule: {rule_name}",
                    description=f"Details for rule {rule_name}",
                    mimeType="application/json",
                )
            )

        return resources

    async def read_resource(self, uri: str) -> str:
        """Read a resource by URI.

        Args:
            uri: Resource URI (e.g., "ontology://schema",
                "ontology://agent/lang-golang-expert")

        Returns:
            JSON string with the resource content.
        """
        # Parse URI
        if not uri.startswith("ontology://"):
            return json.dumps({"error": f"Invalid URI scheme: {uri}"})

        path = uri[len("ontology://") :]
        parts = path.split("/", 1)
        resource_type = parts[0]
        resource_id = parts[1] if len(parts) > 1 else ""

        if resource_type == "schema":
            return self._read_schema()
        elif resource_type == "agent":
            return self._read_agent(resource_id)
        elif resource_type == "rule":
            return self._read_rule(resource_id)
        else:
            return json.dumps({"error": f"Unknown resource type: {resource_type}"})

    def _read_schema(self) -> str:
        """Read the ontology schema."""
        schema_path = self.ontology_dir / "schema.yaml"

        result: dict[str, Any] = {}

        if schema_path.exists():
            schema_data = yaml.safe_load(schema_path.read_text()) or {}
            result["schema"] = schema_data

        # Add class hierarchies from loaded ontology
        result["agent_classes"] = {
            cls_name: agents
            for cls_name, agents in self.ontology.agent_classes.items()
        }
        result["skill_classes"] = {
            cls_name: skills
            for cls_name, skills in self.ontology.skill_classes.items()
        }
        result["rule_categories"] = self.ontology.rule_categories

        result["stats"] = {
            "total_agents": len(self.ontology.agents),
            "total_skills": len(self.ontology.skills),
            "total_rules": len(self.ontology.rules),
            "agent_classes": len(self.ontology.agent_classes),
            "skill_classes": len(self.ontology.skill_classes),
        }

        return json.dumps(result, indent=2)

    def _read_agent(self, agent_name: str) -> str:
        """Read agent details including skills and rules."""
        context = self.ontology.get_agent_context(agent_name)

        if not context:
            return json.dumps({"error": f"Agent not found: {agent_name}"})

        agent = context["agent"]
        result = {
            "agent": {
                "name": agent.name,
                "class": agent.agent_class,
                "description": agent.description,
                "model": agent.model,
                "memory": agent.memory,
                "effort": agent.effort,
                "summary": agent.summary,
                "keywords": agent.keywords,
                "file_patterns": agent.file_patterns,
                "tools": agent.tools,
            },
            "skills": [
                {
                    "name": s.name,
                    "class": s.skill_class,
                    "description": s.description,
                    "summary": s.summary,
                    "user_invocable": s.user_invocable,
                }
                for s in context["skills"]
            ],
            "rules": [
                {
                    "name": r.name,
                    "class": r.rule_class,
                    "title": r.title,
                    "summary": r.summary,
                    "token_estimate": r.token_estimate,
                }
                for r in context["rules"]
            ],
            "token_estimate": context["token_estimate"],
        }

        return json.dumps(result, indent=2)

    def _read_rule(self, rule_id: str) -> str:
        """Read rule summary or full text."""
        rule = self.ontology.get_rule(rule_id)

        if not rule:
            return json.dumps({"error": f"Rule not found: {rule_id}"})

        result: dict[str, Any] = {
            "name": rule.name,
            "class": rule.rule_class,
            "title": rule.title,
            "summary": rule.summary,
            "categories": rule.categories,
            "keywords": rule.keywords,
            "token_estimate": rule.token_estimate,
            "applies_to": rule.applies_to,
        }

        # Try to load full markdown content
        if rule.filename:
            # Search common rule locations
            for search_dir in [
                self.ontology_dir.parent / "rules",  # .claude/rules/
                self.ontology_dir / "rules",
            ]:
                rule_path = (search_dir / rule.filename).resolve()
                # Prevent path traversal attacks
                if not str(rule_path).startswith(str(search_dir.resolve())):
                    continue
                if rule_path.exists():
                    result["full_text"] = rule_path.read_text()
                    break

        return json.dumps(result, indent=2)
