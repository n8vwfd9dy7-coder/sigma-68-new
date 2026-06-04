const commands = [
  { name: "help", description: "SCW help menu" },

  { name: "setup", description: "Setup SCW system" },

  {
    name: "addteam",
    description: "Add a team",
    options: [
      {
        name: "name",
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "sign-player",
    description: "Sign player to a team",
    options: [
      {
        name: "player",
        description: "Player name",
        type: 3,
        required: true,
      },
      {
        name: "team",
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "release-player",
    description: "Release a player",
    options: [
      {
        name: "player",
        description: "Player name",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "roster",
    description: "Show team roster",
    options: [
      {
        name: "team",
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },
];