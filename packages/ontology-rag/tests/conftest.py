"""Shared test fixtures for ontology-rag tests."""

import pytest
from pathlib import Path
import yaml
import json


@pytest.fixture
def sample_ontology_dir(tmp_path):
    """Create a temporary ontology directory with sample data.

    This fixture creates a complete test ontology including agents, skills,
    and rules in YAML format, plus a graph in JSON format.
    """
    ontology_dir = tmp_path / "ontology"
    ontology_dir.mkdir()
    graphs_dir = ontology_dir / "graphs"
    graphs_dir.mkdir()

    # Sample agents.yaml
    agents_data = {
        "version": "1.0.0",
        "classes": {
            "LanguageExpert": {
                "agents": ["lang-golang-expert", "lang-python-expert"],
                "description": "Programming language specialists",
            },
            "ManagerAgent": {
                "agents": ["mgr-creator"],
                "description": "System management agents",
            },
        },
        "agents": {
            "lang-golang-expert": {
                "class": "LanguageExpert",
                "description": "Expert Go developer",
                "model": "sonnet",
                "memory": "project",
                "effort": "high",
                "skills": ["go-best-practices"],
                "tools": ["Read", "Write", "Edit"],
                "summary": "Go language expert for idiomatic code",
                "keywords": ["go", "golang", "goroutine"],
                "file_patterns": ["*.go", "go.mod"],
            },
            "lang-python-expert": {
                "class": "LanguageExpert",
                "description": "Expert Python developer",
                "model": "sonnet",
                "memory": "project",
                "skills": ["python-best-practices"],
                "tools": ["Read", "Write", "Edit"],
                "summary": "Python expert for Pythonic code",
                "keywords": ["python", "pip", "poetry"],
                "file_patterns": ["*.py", "requirements.txt"],
            },
            "mgr-creator": {
                "class": "ManagerAgent",
                "description": "Create new agents",
                "model": "sonnet",
                "skills": ["create-agent"],
                "tools": ["Read", "Write"],
                "summary": "Creates new agent definitions",
                "keywords": ["create", "agent", "new"],
                "file_patterns": [],
            },
        },
    }
    (ontology_dir / "agents.yaml").write_text(
        yaml.dump(agents_data, default_flow_style=False)
    )

    # Sample skills.yaml
    skills_data = {
        "version": "1.0.0",
        "classes": {
            "BestPracticeSkill": {
                "skills": ["go-best-practices", "python-best-practices"],
                "description": "Best practice skills",
            },
            "ManagementSkill": {
                "skills": ["create-agent"],
                "description": "Management skills",
            },
            "RoutingSkill": {
                "skills": ["dev-lead-routing"],
                "description": "Routing skills",
            },
        },
        "skills": {
            "go-best-practices": {
                "class": "BestPracticeSkill",
                "description": "Go best practices",
                "user_invocable": False,
                "summary": "Idiomatic Go patterns",
                "keywords": ["go", "golang", "formatting"],
                "rule_references": ["R006", "R007"],
            },
            "python-best-practices": {
                "class": "BestPracticeSkill",
                "description": "Python best practices",
                "user_invocable": False,
                "summary": "Pythonic patterns",
                "keywords": ["python", "pep8"],
                "rule_references": ["R006"],
            },
            "create-agent": {
                "class": "ManagementSkill",
                "description": "Create new agents",
                "user_invocable": True,
                "summary": "Create agent definitions",
                "keywords": ["create", "agent", "new"],
                "rule_references": ["R006", "R017"],
            },
            "dev-lead-routing": {
                "class": "RoutingSkill",
                "description": "Route dev tasks",
                "user_invocable": False,
                "summary": "Routes to language/framework experts",
                "keywords": ["routing", "development"],
                "routes_to": ["lang-golang-expert", "lang-python-expert"],
            },
        },
    }
    (ontology_dir / "skills.yaml").write_text(
        yaml.dump(skills_data, default_flow_style=False)
    )

    # Sample rules.yaml
    rules_data = {
        "version": "1.0.0",
        "categories": {
            "agent-design": {
                "rules": ["R006", "R007"],
                "summary": "Agent structure and identification",
                "keywords": ["agent", "design", "identification"],
            },
            "quality": {
                "rules": ["R017"],
                "summary": "Verification and improvement",
                "keywords": ["verification", "sync"],
            },
        },
        "rules": {
            "R006": {
                "class": "MustRule",
                "categories": ["agent-design"],
                "title": "Agent Design Rules",
                "filename": "MUST-agent-design.md",
                "summary": "Agent file format, memory scopes, separation of concerns",
                "keywords": ["agent", "design", "frontmatter", "memory"],
                "token_estimate": 300,
                "applies_to": ["all"],
            },
            "R007": {
                "class": "MustRule",
                "categories": ["agent-design"],
                "title": "Agent Identification Rules",
                "filename": "MUST-agent-identification.md",
                "summary": "Every response must start with agent identification",
                "keywords": ["identification", "response", "header"],
                "token_estimate": 200,
                "applies_to": ["all"],
            },
            "R017": {
                "class": "MustRule",
                "categories": ["quality"],
                "title": "Sync Verification Rules",
                "filename": "MUST-sync-verification.md",
                "summary": "Run verification before committing",
                "keywords": ["sync", "verification", "sauron"],
                "token_estimate": 817,
                "applies_to": ["all"],
            },
        },
    }
    (ontology_dir / "rules.yaml").write_text(
        yaml.dump(rules_data, default_flow_style=False)
    )

    # Sample full-graph.json
    graph_data = {
        "description": "Complete ontology graph",
        "version": "1.0.0",
        "nodes": {
            "lang-golang-expert": {"type": "Agent", "class": "LanguageExpert"},
            "lang-python-expert": {"type": "Agent", "class": "LanguageExpert"},
            "mgr-creator": {"type": "Agent", "class": "ManagerAgent"},
            "go-best-practices": {"type": "Skill", "class": "BestPracticeSkill"},
            "python-best-practices": {"type": "Skill", "class": "BestPracticeSkill"},
            "create-agent": {"type": "Skill", "class": "ManagementSkill"},
            "dev-lead-routing": {"type": "Skill", "class": "RoutingSkill"},
            "R006": {"type": "Rule", "class": "MustRule"},
            "R007": {"type": "Rule", "class": "MustRule"},
            "R017": {"type": "Rule", "class": "MustRule"},
        },
        "edges": [
            {
                "source": "lang-golang-expert",
                "target": "go-best-practices",
                "relation": "requires",
            },
            {
                "source": "lang-python-expert",
                "target": "python-best-practices",
                "relation": "requires",
            },
            {"source": "mgr-creator", "target": "create-agent", "relation": "requires"},
            {"source": "go-best-practices", "target": "R006", "relation": "depends_on"},
            {"source": "go-best-practices", "target": "R007", "relation": "depends_on"},
            {"source": "python-best-practices", "target": "R006", "relation": "depends_on"},
            {"source": "create-agent", "target": "R006", "relation": "depends_on"},
            {"source": "create-agent", "target": "R017", "relation": "depends_on"},
            {
                "source": "dev-lead-routing",
                "target": "lang-golang-expert",
                "relation": "routes_to",
            },
            {
                "source": "dev-lead-routing",
                "target": "lang-python-expert",
                "relation": "routes_to",
            },
        ],
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data, indent=2))

    return ontology_dir


@pytest.fixture
def sample_rules_dir(tmp_path):
    """Create a temporary rules directory with sample rule files."""
    rules_dir = tmp_path / "rules"
    rules_dir.mkdir()

    (rules_dir / "MUST-agent-design.md").write_text(
        "# Agent Design Rules\n\nAgents must follow standard file format..."
    )
    (rules_dir / "MUST-agent-identification.md").write_text(
        "# Agent Identification\n\nEvery response must start with agent ID..."
    )
    (rules_dir / "MUST-sync-verification.md").write_text(
        "# Sync Verification\n\nRun verification before committing changes..."
    )

    return rules_dir
