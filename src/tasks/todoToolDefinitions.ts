/**
 * Provider-neutral declarations of the TODO tools: name, model-facing description and JSON input schema.
 * Each provider adapter (currently the Claude Code MCP server) exposes these and dispatches calls to
 * `todoToolOperations`.
 */
export interface TodoToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export const todoToolDefinitions: TodoToolDefinition[] = [
    {
        "name": "read_implementation_todos",
        "description": "Read the implementation-todo.json for the single active task marker. Use this to inspect TODO status and context; never read or write the JSON directly.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }
    },
    {
        "name": "manage_implementation_todos",
        "description": "Manage agent-owned TODO items in the active task's implementation-todo.json. Supports add, update, explicit plan-reconcile, atomic sync-plan, remove, reorder, and set-plan actions. Use sync-plan once after a user selects a plan, passing every ordered group and item derived from the selected plan and current review reports. The extension validates every mutation, updates summaries, writes atomically, and rejects any attempt to edit or remove user-created items. Never edit the TODO JSON directly. Read the result back after every mutation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "add",
                        "update",
                        "reconcile",
                        "remove",
                        "reorder",
                        "set-plan",
                        "sync-plan"
                    ]
                },
                "group": {
                    "type": "string"
                },
                "itemId": {
                    "type": "string"
                },
                "item": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string"
                        },
                        "done": {
                            "type": "boolean"
                        },
                        "source": {
                            "type": "string",
                            "enum": [
                                "plan",
                                "request",
                                "user-note",
                                "logic-review",
                                "code-readability"
                            ]
                        },
                        "sourceRef": {
                            "type": "string"
                        },
                        "why": {
                            "type": "string"
                        },
                        "files": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "decisions": {
                            "type": "string"
                        },
                        "acceptance": {
                            "type": "string"
                        },
                        "evidence": {
                            "type": "string"
                        },
                        "remaining": {
                            "type": "string"
                        },
                        "alert": {
                            "type": [
                                "string",
                                "null"
                            ]
                        }
                    },
                    "required": [
                        "title",
                        "done",
                        "source",
                        "sourceRef",
                        "why",
                        "files",
                        "decisions",
                        "acceptance",
                        "evidence",
                        "remaining",
                        "alert"
                    ],
                    "additionalProperties": false
                },
                "changes": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string"
                        },
                        "done": {
                            "type": "boolean"
                        },
                        "source": {
                            "type": "string",
                            "enum": [
                                "plan",
                                "request",
                                "user-note",
                                "logic-review",
                                "code-readability"
                            ]
                        },
                        "sourceRef": {
                            "type": "string"
                        },
                        "why": {
                            "type": "string"
                        },
                        "files": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "decisions": {
                            "type": "string"
                        },
                        "acceptance": {
                            "type": "string"
                        },
                        "evidence": {
                            "type": "string"
                        },
                        "remaining": {
                            "type": "string"
                        },
                        "alert": {
                            "type": [
                                "string",
                                "null"
                            ]
                        }
                    },
                    "additionalProperties": false
                },
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string"
                            },
                            "itemIds": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                }
                            }
                        },
                        "required": [
                            "name",
                            "itemIds"
                        ],
                        "additionalProperties": false
                    }
                },
                "planGroups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string"
                            },
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {
                                            "type": "string"
                                        },
                                        "done": {
                                            "type": "boolean"
                                        },
                                        "source": {
                                            "type": "string",
                                            "enum": [
                                                "plan",
                                                "logic-review",
                                                "code-readability"
                                            ]
                                        },
                                        "sourceRef": {
                                            "type": "string"
                                        },
                                        "why": {
                                            "type": "string"
                                        },
                                        "files": {
                                            "type": "array",
                                            "items": {
                                                "type": "string"
                                            }
                                        },
                                        "decisions": {
                                            "type": "string"
                                        },
                                        "acceptance": {
                                            "type": "string"
                                        },
                                        "evidence": {
                                            "type": "string"
                                        },
                                        "remaining": {
                                            "type": "string"
                                        },
                                        "alert": {
                                            "type": [
                                                "string",
                                                "null"
                                            ]
                                        }
                                    },
                                    "required": [
                                        "title",
                                        "done",
                                        "source",
                                        "sourceRef",
                                        "why",
                                        "files",
                                        "decisions",
                                        "acceptance",
                                        "evidence",
                                        "remaining",
                                        "alert"
                                    ],
                                    "additionalProperties": false
                                }
                            }
                        },
                        "required": [
                            "name",
                            "items"
                        ],
                        "additionalProperties": false
                    }
                },
                "plan": {
                    "type": "string"
                }
            },
            "required": [
                "action"
            ],
            "additionalProperties": false
        }
    },
    {
        "name": "sync_logic_review_todos",
        "description": "Add or update confirmed Logic Review findings in the active task checklist by stable sourceRef. Remove stale agent-owned Logic Review findings not present in the new report. User-created items are preserved and cannot be changed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string"
                            },
                            "done": {
                                "type": "boolean"
                            },
                            "sourceRef": {
                                "type": "string"
                            },
                            "why": {
                                "type": "string"
                            },
                            "files": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                }
                            },
                            "decisions": {
                                "type": "string"
                            },
                            "acceptance": {
                                "type": "string"
                            },
                            "evidence": {
                                "type": "string"
                            },
                            "remaining": {
                                "type": "string"
                            },
                            "alert": {
                                "type": [
                                    "string",
                                    "null"
                                ]
                            }
                        },
                        "required": [
                            "title",
                            "done",
                            "sourceRef",
                            "why",
                            "files",
                            "decisions",
                            "acceptance",
                            "evidence",
                            "remaining",
                            "alert"
                        ],
                        "additionalProperties": false
                    }
                }
            },
            "required": [
                "items"
            ],
            "additionalProperties": false
        }
    },
    {
        "name": "sync_code_readability_todos",
        "description": "Set the readability proposals the user selected in the Code Readability group of the active task checklist, matched by stable sourceRef. Send the complete set of the Code Readability group on every call: its earlier agent-owned readability items plus new selections, because agent-owned readability items of that group missing from the call are removed. Never send items from other groups: they are added to Code Readability as copies; update those with manage_implementation_todos instead. Use done=false until an item is implemented and verified, then done=true. User-created items are preserved and cannot be changed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string"
                            },
                            "done": {
                                "type": "boolean"
                            },
                            "sourceRef": {
                                "type": "string"
                            },
                            "why": {
                                "type": "string"
                            },
                            "files": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                }
                            },
                            "decisions": {
                                "type": "string"
                            },
                            "acceptance": {
                                "type": "string"
                            },
                            "evidence": {
                                "type": "string"
                            },
                            "remaining": {
                                "type": "string"
                            },
                            "alert": {
                                "type": [
                                    "string",
                                    "null"
                                ]
                            }
                        },
                        "required": [
                            "title",
                            "done",
                            "sourceRef",
                            "why",
                            "files",
                            "decisions",
                            "acceptance",
                            "evidence",
                            "remaining",
                            "alert"
                        ],
                        "additionalProperties": false
                    }
                }
            },
            "required": [
                "items"
            ],
            "additionalProperties": false
        }
    }
];
