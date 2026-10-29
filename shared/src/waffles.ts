/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/waffles.json`.
 */
export type Waffles = {
  "address": "6SpQkgcbZjbrz94pYuWDy5nmBo3czhDGxft1uTvSUR8w",
  "metadata": {
    "name": "waffles",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "buyback",
      "discriminator": [
        106,
        117,
        64,
        30,
        56,
        69,
        7,
        45
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "inventory",
          "writable": true
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "raffle",
          "writable": true
        },
        {
          "name": "holders",
          "writable": true
        },
        {
          "name": "incentives",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        },
        {
          "name": "referenceOut",
          "type": "u64"
        },
        {
          "name": "incentives",
          "type": "bool"
        }
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "distribution",
          "writable": true
        },
        {
          "name": "receipt",
          "writable": true
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    },
    {
      "name": "create",
      "discriminator": [
        24,
        30,
        200,
        40,
        5,
        28,
        7,
        119
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "inventory",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "rent"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createArgs"
            }
          }
        }
      ]
    },
    {
      "name": "finalizeDistribution",
      "discriminator": [
        12,
        246,
        59,
        197,
        66,
        128,
        169,
        197
      ],
      "accounts": [
        {
          "name": "finalizer",
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "distribution",
          "writable": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "drandRound",
          "type": "u64"
        },
        {
          "name": "signature",
          "type": "bytes"
        },
        {
          "name": "beaconTime",
          "type": "i64"
        }
      ]
    },
    {
      "name": "graduate",
      "discriminator": [
        45,
        235,
        225,
        181,
        17,
        218,
        64,
        130
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "inventory"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "initFund",
      "discriminator": [
        214,
        76,
        235,
        174,
        161,
        32,
        165,
        247
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "fund",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "epochId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialBuy",
      "docs": [
        "The only discounted initial purchase is in the SAME transaction as create,",
        "immediately after it, with the mint keypair signing both instructions."
      ],
      "discriminator": [
        41,
        187,
        188,
        156,
        7,
        2,
        121,
        37
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "inventory",
          "writable": true
        },
        {
          "name": "creatorTokens",
          "writable": true
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "raffle",
          "writable": true
        },
        {
          "name": "holders",
          "writable": true
        },
        {
          "name": "instructions"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram"
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "program"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "genesis",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "finalizer",
          "type": "pubkey"
        },
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "lock",
      "discriminator": [
        21,
        19,
        208,
        43,
        237,
        62,
        255,
        87
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "commitment",
          "writable": true
        },
        {
          "name": "ownerTokens",
          "writable": true
        },
        {
          "name": "lockTokens",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "rent"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "unlock",
          "type": "i64"
        },
        {
          "name": "tokenAsset",
          "type": "bool"
        }
      ]
    },
    {
      "name": "moveFund",
      "discriminator": [
        241,
        148,
        119,
        248,
        172,
        218,
        219,
        54
      ],
      "accounts": [
        {
          "name": "finalizer",
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "prepareDistribution",
      "discriminator": [
        66,
        182,
        9,
        4,
        28,
        173,
        149,
        7
      ],
      "accounts": [
        {
          "name": "finalizer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "distribution",
          "writable": true
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "epochId",
          "type": "u64"
        },
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "snapshot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        178,
        144,
        26,
        216,
        241,
        187,
        206,
        130
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "inventory",
          "writable": true
        },
        {
          "name": "traderTokens",
          "writable": true
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "raffle",
          "writable": true
        },
        {
          "name": "holders",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram"
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "isBuy",
          "type": "bool"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unlock",
      "discriminator": [
        101,
        155,
        40,
        21,
        158,
        189,
        56,
        203
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "commitment",
          "writable": true
        },
        {
          "name": "ownerTokens",
          "writable": true
        },
        {
          "name": "lockTokens",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "locked",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdrawPlatform",
      "discriminator": [
        87,
        237,
        31,
        212,
        241,
        172,
        99,
        33
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "commitment",
      "discriminator": [
        61,
        112,
        129,
        128,
        24,
        147,
        77,
        87
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "distribution",
      "discriminator": [
        176,
        85,
        17,
        11,
        13,
        194,
        18,
        1
      ]
    },
    {
      "name": "fund",
      "discriminator": [
        62,
        128,
        183,
        208,
        91,
        31,
        212,
        209
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "receipt",
      "discriminator": [
        39,
        154,
        73,
        106,
        80,
        102,
        145,
        153
      ]
    }
  ],
  "events": [
    {
      "name": "boughtBack",
      "discriminator": [
        188,
        156,
        61,
        154,
        116,
        184,
        186,
        21
      ]
    },
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "created",
      "discriminator": [
        65,
        254,
        68,
        245,
        102,
        148,
        244,
        76
      ]
    },
    {
      "name": "distributionFinalized",
      "discriminator": [
        232,
        198,
        127,
        113,
        61,
        16,
        158,
        22
      ]
    },
    {
      "name": "distributionPrepared",
      "discriminator": [
        209,
        105,
        201,
        171,
        2,
        72,
        110,
        66
      ]
    },
    {
      "name": "feesAllocated",
      "discriminator": [
        53,
        240,
        32,
        213,
        108,
        203,
        110,
        47
      ]
    },
    {
      "name": "fundMoved",
      "discriminator": [
        40,
        133,
        4,
        136,
        194,
        172,
        28,
        99
      ]
    },
    {
      "name": "graduated",
      "discriminator": [
        51,
        241,
        66,
        50,
        140,
        245,
        156,
        192
      ]
    },
    {
      "name": "locked",
      "discriminator": [
        188,
        53,
        118,
        62,
        64,
        12,
        198,
        84
      ]
    },
    {
      "name": "traded",
      "discriminator": [
        225,
        202,
        73,
        175,
        147,
        43,
        160,
        150
      ]
    },
    {
      "name": "unlocked",
      "discriminator": [
        219,
        104,
        74,
        123,
        174,
        92,
        182,
        120
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalid",
      "msg": "Invalid parameters"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized account"
    },
    {
      "code": 6002,
      "name": "overflow",
      "msg": "Checked arithmetic overflow"
    },
    {
      "code": 6003,
      "name": "insufficient",
      "msg": "Insufficient accounted funds"
    },
    {
      "code": 6004,
      "name": "slippage",
      "msg": "Minimum output not met"
    },
    {
      "code": 6005,
      "name": "zeroOutput",
      "msg": "No output"
    },
    {
      "code": 6006,
      "name": "complete",
      "msg": "Curve complete; graduation pending"
    },
    {
      "code": 6007,
      "name": "locked",
      "msg": "Commitment has not unlocked or was withdrawn"
    },
    {
      "code": 6008,
      "name": "proof",
      "msg": "Invalid claim proof"
    }
  ],
  "types": [
    {
      "name": "boughtBack",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "sol",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "time",
            "type": "i64"
          },
          {
            "name": "incentives",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "distribution",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "commitment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "start",
            "type": "i64"
          },
          {
            "name": "unlock",
            "type": "i64"
          },
          {
            "name": "tokenAsset",
            "type": "bool"
          },
          {
            "name": "withdrawn",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "finalizer",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "genesis",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "platform",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "imageUri",
            "type": "string"
          },
          {
            "name": "routing",
            "type": {
              "defined": {
                "name": "routing"
              }
            }
          },
          {
            "name": "feeCliff",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "created",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "time",
            "type": "i64"
          },
          {
            "name": "args",
            "type": {
              "defined": {
                "name": "createArgs"
              }
            }
          }
        ]
      }
    },
    {
      "name": "distribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "u64"
          },
          {
            "name": "snapshot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "committedAt",
            "type": "i64"
          },
          {
            "name": "beaconAfter",
            "type": "i64"
          },
          {
            "name": "drandRound",
            "type": "u64"
          },
          {
            "name": "signatureHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "distributionFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "pubkey"
          },
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "drandRound",
            "type": "u64"
          },
          {
            "name": "signature",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "distributionPrepared",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "pubkey"
          },
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "snapshot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "beaconAfter",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feesAllocated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "time",
            "type": "i64"
          },
          {
            "name": "creator",
            "type": "u64"
          },
          {
            "name": "locked",
            "type": "u64"
          },
          {
            "name": "holders",
            "type": "u64"
          },
          {
            "name": "buyback",
            "type": "u64"
          },
          {
            "name": "platform",
            "type": "u64"
          },
          {
            "name": "raffle",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fund",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fundMoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "source",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "graduated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "time",
            "type": "i64"
          },
          {
            "name": "sol",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "locked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "start",
            "type": "i64"
          },
          {
            "name": "unlock",
            "type": "i64"
          },
          {
            "name": "tokenAsset",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "launchedAt",
            "type": "i64"
          },
          {
            "name": "state",
            "type": "u8"
          },
          {
            "name": "virtualSol",
            "type": "u64"
          },
          {
            "name": "virtualTokens",
            "type": "u64"
          },
          {
            "name": "realSol",
            "type": "u64"
          },
          {
            "name": "direct",
            "type": "u64"
          },
          {
            "name": "locked",
            "type": "u64"
          },
          {
            "name": "buyback",
            "type": "u64"
          },
          {
            "name": "feeCliff",
            "type": "i64"
          },
          {
            "name": "routing",
            "type": {
              "defined": {
                "name": "routing"
              }
            }
          },
          {
            "name": "lastBuyback",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "imageUri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "receipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "routing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "direct",
            "type": "u16"
          },
          {
            "name": "locked",
            "type": "u16"
          },
          {
            "name": "holders",
            "type": "u16"
          },
          {
            "name": "buyback",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "traded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "buy",
            "type": "bool"
          },
          {
            "name": "gross",
            "type": "u64"
          },
          {
            "name": "net",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "solReserve",
            "type": "u64"
          },
          {
            "name": "tokenReserve",
            "type": "u64"
          },
          {
            "name": "time",
            "type": "i64"
          },
          {
            "name": "protocol",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "unlocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "pubkey"
          },
          {
            "name": "time",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
