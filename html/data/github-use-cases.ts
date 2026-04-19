// Auto-generated from GitHub issues at educoreproject/educore_use_cases.
// Regenerate via /tmp/build_ghuc.mjs (fed by `gh issue list ... --json number,title,labels,body`
// and /tmp/ceds-mappings.json from the EDUcore MCP).

export type UseCaseStatus = 'vetted' | 'partially-vetted' | 'unvetted';

export interface GithubActor { name: string; role: string; }
export interface GithubStep { stepNumber: number; actor: string; action: string; }
export interface GithubSwimlane { headers: string[]; rows: string[][]; }
export interface GithubDataRow { name: string; def: string; url: string; }
export interface ConnectedStandard { standard: string; count: number; implicit?: boolean; }

export interface GithubUseCase {
  id: string;
  githubIssue: number;
  title: string;
  topic: 'sedm' | 'p20w-ler';
  subcategoryId: string;
  subcategoryLabel: string;
  status: UseCaseStatus;
  labels: string[];
  cedsDomains: string[];
  description: string;
  objectives: string;
  scenario: string;
  actors: GithubActor[];
  steps: GithubStep[];
  swimlane: GithubSwimlane | null;
  keyConcepts: string;
  data: GithubDataRow[];
  cedsClassIds: string[];
  connectedStandards: ConnectedStandard[];
  dependencies: string;
  outcomes: string;
  references: string;
}

export interface UseCaseSubcategory { id: string; label: string; children: string[]; }
export interface UseCaseTopic {
  id: string; label: string; subtitle: string; icon: string;
  children: UseCaseSubcategory[];
}

export const githubUseCaseData = 
{
  "taxonomy": [
    {
      "id": "sedm",
      "label": "SEDM",
      "subtitle": "Special Education Data Model — federal reporting, Section 618 compliance, and IDEA data workflows.",
      "icon": "🏛",
      "children": [
        {
          "id": "sedm-section618",
          "label": "Section 618 Federal Reporting",
          "children": [
            "section-618-child-count-and-educational-environments-reporti",
            "section-618-assessment-data-reporting",
            "section-618-exiting-special-education-reporting",
            "section-618-personnel-reporting",
            "section-618-dispute-resolution-reporting",
            "section-618-moe-reduction-and-coordinated-early-intervening-"
          ]
        },
        {
          "id": "sedm-idea",
          "label": "IDEA Compliance",
          "children": [
            "idea-part-c-early-intervention-reporting",
            "child-find-and-identification-including-disproportionality-m",
            "initial-referral-and-evaluation"
          ]
        },
        {
          "id": "sedm-edfacts",
          "label": "EdFacts Reporting",
          "children": [
            "federal-k-12-edfacts-reporting",
            "special-education-federal-reporting-fs002"
          ]
        }
      ]
    },
    {
      "id": "p20w-ler",
      "label": "P20W+LER",
      "subtitle": "PK-20-Workforce lifelong learning — LERs, digital wallets, AI-empowered learning, and workforce data systems.",
      "icon": "📜",
      "children": [
        {
          "id": "ler-issuing",
          "label": "LER Issuing",
          "children": [
            "ler-issuance",
            "workplace-training-recognition",
            "ler-issuance-from-slds",
            "workforce-readiness-digital-literacy-recognition-through-sta",
            "employer-issued-skill-recognition-for-career-mobility-portab",
            "educator-licensure-teacher-talent-pipeline-using-wallet-base",
            "military-to-civilian-skill-translation-for-hiring",
            "recognition-of-informal-community-based-entrepreneurial-lear"
          ]
        },
        {
          "id": "ler-verifying",
          "label": "LER Verifying",
          "children": [
            "ler-verification",
            "privacy-preserving-proof-of-employment",
            "verification-of-program-completion-job-readiness-training"
          ]
        },
        {
          "id": "ler-wallets",
          "label": "LER Wallets & Digital Credentials",
          "children": [
            "digital-wallets-verifiable-credentials-gates-2",
            "digital-wallet-storage-control-and-selective-sharing-of-lers",
            "privacy-preserving-selectively-disclosed-opportunity-access"
          ]
        },
        {
          "id": "ler-hiring",
          "label": "LER for Hiring & Career Mobility",
          "children": [
            "skills-based-job-application-with-a-verifiable-ler",
            "resume-to-structure-ler-conversion-for-reuse-across-hiring-s",
            "passive-candidate-discovery-and-employer-matching-using-an-l",
            "career-pathway-navigation-opportunity-discover-using-an-ler",
            "job-board-to-ats-transfer-for-partial-application-completion",
            "inclusive-ler-support-for-nonlinear-marginalized-worker-jour",
            "state-or-regional-ler-ecosystem-for-talent-pipelines-pathway"
          ]
        },
        {
          "id": "p20w-statistics",
          "label": "Government & Statistical Reporting",
          "children": [
            "the-initial-and-ongoing-unemployment-insurance-benefit-payme",
            "reemployment-of-ui-benefit-recipients-1-2",
            "benchmarking-hr-analytics-and-talent-recruitment-and-managem",
            "benchmarking-current-compensation-and-providing-career-guida",
            "improving-employment-outcomes-data-for-managing-and-improvin",
            "supply-demand-analysis-to-align-education-and-workforce-inve"
          ]
        },
        {
          "id": "ler-other",
          "label": "LER Social & Life Events",
          "children": [
            "career-navigation-advising-gates-4",
            "guardianship-consent-credentials-for-education-human-service"
          ]
        }
      ]
    }
  ],
  "useCases": [
    {
      "id": "federal-k-12-edfacts-reporting",
      "githubIssue": 1,
      "title": "Federal K-12 EDFacts Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-edfacts",
      "subcategoryLabel": "EdFacts Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "State EDFacts Coordinators submit data to EDFacts, a U. S. Department of Education initiative to put performance data at the center of policy, management and budget decisions for all K-12 educational programs. EDFacts centralizes performance data supplied by K-12 state education agencies (SEAs) with other data assets, such as financial grant information, within the Department to enable better analysis and use in policy development, planning and management.",
      "objectives": "As an EDFacts Coordinator, I want to assemble and validate the required data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirements.",
      "scenario": "State education agency reporting requirements.",
      "actors": [
        {
          "name": "EDFacts Coordinator / State System",
          "role": "a designated official within a State Education Agency (SEA) who acts as the primary liaison with the U.S. Department of Education (ED) for the submission of annual K-12 performance, demographic, and program data."
        },
        {
          "name": "EDFacts EDPass System",
          "role": "a modernized, centralized data submission application used by the U.S. Department of Education (ED) to collect, validate, and process elementary and secondary education data from State Education Agencies (SEAs)."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "EDFacts Coordinator / State System",
          "action": "assemble and validate data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirements."
        },
        {
          "stepNumber": 2,
          "actor": "EDFacts EDPass System",
          "action": "receive, validate, and process data meeting reporting requirements."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "EDFacts Coordinator / State System",
          "EDFacts EDPass System"
        ],
        "rows": [
          [
            "1",
            "assemble and validate data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirements.",
            ""
          ],
          [
            "2",
            "",
            "receive, validate, and process data meeting reporting requirements."
          ]
        ]
      },
      "keyConcepts": "See: https://edfacts.communities.ed.gov/#program/data-submission-organizer",
      "data": [
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:Local Education Agency Federal Reporting",
          "def": "Federal reporting status values and counts for an LEA.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200190"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        },
        {
          "name": "Class:K12 Student Enrollment",
          "def": "Information about a student enrollment that is unique to the K12 context.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200219"
        }
      ],
      "cedsClassIds": [
        "C200188",
        "C200190",
        "C200204",
        "C200219"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 4,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 364
        },
        {
          "standard": "Ed-Fi",
          "count": 42
        },
        {
          "standard": "SEDM",
          "count": 13
        },
        {
          "standard": "CIP",
          "count": 9
        },
        {
          "standard": "LIF",
          "count": 7
        }
      ],
      "dependencies": "State (SEA) systems to collected, validate, and process data from local education agencies (LEA)s.",
      "outcomes": "SEA meeds federal requirements.",
      "references": "* [Official EDFacts site.](https://edfacts.communities.ed.gov/#program/data-submission-organizer)"
    },
    {
      "id": "ler-issuance",
      "githubIssue": 2,
      "title": "LER Issuance",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "vetted",
      "labels": [
        "P20W+LER",
        "LER",
        "Vetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "In this use case, the learning and employment record (LER), such as an OpenBadge v3, a single micro-credential assertion wrapped in a Verifiable Credential (VC) being issued to a learner’s digital wallet.",
      "objectives": "A learner and worker, and digital wallet holder, can receive a learning and employment record (LER) from an Issuer, such as an employer, or education or training provider.",
      "scenario": "The following Use Case Diagram illustrates the interactions between the three primary actors in the \"Trust Triangle\": the Issuer, the Holder, and the Trust Registry, which may or may or not leverage distributed ledger technology. VC issuing use cases also may require registries. This use case uses an Identity Registry, Skills Registry, and optional Trust Registry.",
      "actors": [
        {
          "name": "Issuer / Issuing System",
          "role": "As Issuer, I want a Holder’s digital wallet to receive a learning and employment record (LER)."
        },
        {
          "name": "Holder / Holder’s Digital Wallet",
          "role": "I'm a learner and worker. As Holder of a digital wallet, I want my digital wallet to receive and store an LER."
        },
        {
          "name": "Identity Registry",
          "role": "Provides identity verification."
        },
        {
          "name": "Skills Registry",
          "role": "Provides skills definitions & metadata."
        },
        {
          "name": "Verifiable Data Registry",
          "role": "Provides trust signals."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Issuer / Issuing System",
          "action": "Identify Holder: Perform know your customer (see KYC use cases)."
        },
        {
          "stepNumber": 2,
          "actor": "Issuer / Issuing System",
          "action": "Generate Credential: Create a digital document with specific claims linked to a registered skill definition."
        },
        {
          "stepNumber": 3,
          "actor": "Issuer / Issuing System",
          "action": "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level."
        },
        {
          "stepNumber": 4,
          "actor": "Issuer / Issuing System",
          "action": "Sign Credential: Digitally sign the VC using the Issuer's private key."
        },
        {
          "stepNumber": 5,
          "actor": "Verifiable Data Registry",
          "action": "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
        },
        {
          "stepNumber": 6,
          "actor": "Issuer / Issuing System",
          "action": "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link)."
        },
        {
          "stepNumber": 7,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Receive & Review: The Holder receives the VC and reviews the claims."
        },
        {
          "stepNumber": 8,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Store in Wallet: Save the VC in a digital wallet for future use."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Issuer / Issuing System",
          "Holder / Holder’s Digital Wallet",
          "Identity Registry",
          "Skills Registry",
          "Verifiable Data Registry"
        ],
        "rows": [
          [
            "1",
            "Identify Holder: Perform know your customer (see KYC use cases).",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "Generate Credential: Create a digital document with specific claims linked to a registered skill definition.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level.",
            "",
            "",
            "",
            ""
          ],
          [
            "4",
            "Sign Credential: Digitally sign the VC using the Issuer's private key.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
          ],
          [
            "6",
            "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link).",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "",
            "Receive & Review: The Holder receives the VC and reviews the claims.",
            "",
            "",
            ""
          ],
          [
            "8",
            "",
            "Store in Wallet: Save the VC in a digital wallet for future use.",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "CEDS: Credential Award (Class)",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "CEDS: Has Criteria Definition (Class)",
          "def": "Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200087"
        },
        {
          "name": "CEDS: Credential Definition Criteria Definition (Class)",
          "def": "References the criteria by which a credential may be issued.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/A/C200085/P600373"
        },
        {
          "name": "CEDS: Competency Definition (Class)",
          "def": "A resource that states a capability or behavior that a person may learn or be able to do within a given context with references to potential levels of competence, a mastery threshold, and other contextualizing metadata.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200065"
        },
        {
          "name": "CEDS: Rubric (Class)",
          "def": "A set of criteria or indicators that assist in determining whether an entity possesses a given competence or level of performance in a task or work product.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/A/C200353"
        },
        {
          "name": "CEDS: Rubric Criterion (Class)",
          "def": "A single criterion by which one aspect of an entity's competence may be evaluated.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/A/C200354"
        },
        {
          "name": "CEDS: Rubric Criterion Level (Class)",
          "def": "A degree or level of competence.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/A/C200355"
        },
        {
          "name": "Schema:GetOpenBadgeCredentialsResponse JSON schema",
          "def": "JSON Schema for a verifiable credentials wrapped open badge.",
          "url": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_getopenbadgecredentialsresponse_schema.json"
        }
      ],
      "cedsClassIds": [
        "C200079",
        "C200087",
        "C200065"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 3,
          "implicit": true
        },
        {
          "standard": "CTDL",
          "count": 292
        },
        {
          "standard": "LIF",
          "count": 250
        },
        {
          "standard": "CIP",
          "count": 212
        },
        {
          "standard": "CLR",
          "count": 82
        },
        {
          "standard": "CASE",
          "count": 79
        },
        {
          "standard": "Ed-Fi",
          "count": 64
        },
        {
          "standard": "SIF",
          "count": 12
        },
        {
          "standard": "SEDM",
          "count": 2
        }
      ],
      "dependencies": "* The learner / worker as Holder must have a digital wallet or passport application to receive the LER.",
      "outcomes": "* A learner worker is empowered with their data as verifiable credentials.",
      "references": "* [Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)\n* [Identity Registries -- Building Trust In A Digital World: Scalable Solutions For Verifiable Credential Ecosystems](https://credentialengine.org/2025/06/09/building-trust-in-a-digital-world-scalable-solutions-for-verifiable-credential-ecosystems/#:~:text=Issuer%20identity%20registries%20make%20that,to%20confirm%20the%20issuer's%20authenticity.)"
    },
    {
      "id": "ler-verification",
      "githubIssue": 3,
      "title": "LER Verification",
      "topic": "p20w-ler",
      "subcategoryId": "ler-verifying",
      "subcategoryLabel": "LER Verifying",
      "status": "partially-vetted",
      "labels": [
        "P20W+LER",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "In this use case, the Verifier (often called the Relying Party) validates a Learning and Employment Record (LER) authenticity without ever contacting the original Issuer. In this case, the LER is an OpenBadge v3, a single micro-credential assertion wrapped in a Verifiable Credential (VC) that was previously issued to a learner’s digital wallet.",
      "objectives": "To validate the authenticity, ownership, and revocation status of a skill assertion presented by a Holder using cryptographic proofs and decentralized registries.",
      "scenario": "The process involves cryptographic verification that the LER has not been tampered with. It typically involves verifying the identity of the parties linked to the VC using an Identity Registry, Trust Registry, or Verifiable Data Registry. It may also involve looking up additional skill definition metadata from a referenced Skills Registry.",
      "actors": [
        {
          "name": "Verifier",
          "role": "Validates the authenticity of a skill assertion presented by a Holder."
        },
        {
          "name": "Holder",
          "role": "Presents a verifiable LER from their digital wallet to a Verifier."
        },
        {
          "name": "Identity Registry",
          "role": "Cryptographically verifies the identifier of the Holder or Issuer is connected to a real person or institution."
        },
        {
          "name": "Skills Registry",
          "role": "Provides additional skill definition metadata, proficiency scales, and standards."
        },
        {
          "name": "Trust Registry",
          "role": "Optional; provides cryptographic methods (like linked VCs) to reinforce confidence in the assertion."
        },
        {
          "name": "Verifiable Data Registry",
          "role": "Maintains records with public keys linked to Issuer identities, often using distributed ledger technology."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Verifier",
          "action": "Request Proof: Send a request for specific information (e.g., \"Proof of Degree\")."
        },
        {
          "stepNumber": 2,
          "actor": "Holder",
          "action": "Select Credentials: The Holder selects the relevant VC(s) from their digital wallet."
        },
        {
          "stepNumber": 3,
          "actor": "Holder",
          "action": "Generate Presentation: Create a Verifiable Presentation (VP)—a digital package of the selected claims."
        },
        {
          "stepNumber": 4,
          "actor": "Holder",
          "action": "Sign Presentation: The Holder signs the VP with their own private key to prove ownership of the VC."
        },
        {
          "stepNumber": 5,
          "actor": "Holder",
          "action": "Submit VP: Send the signed VP to the Verifier (via QR scan or direct link)."
        },
        {
          "stepNumber": 6,
          "actor": "Verifier",
          "action": "Registry Lookup: The Verifier retrieves the Public Keys and metadata from one or more registries."
        },
        {
          "stepNumber": 7,
          "actor": "Verifier",
          "action": "Retrieves data from one or more registries."
        },
        {
          "stepNumber": 8,
          "actor": "Identity Registry",
          "action": "Verify Identity: Verify that the DID belongs to the person that claims to own it."
        },
        {
          "stepNumber": 9,
          "actor": "Trust Registry",
          "action": "(some implementations) Linked Creds or Trust Signals: Verifier retrieves from the registry Linked Creds or other signals of  progressive trust linked to the LER and Holder."
        },
        {
          "stepNumber": 10,
          "actor": "Verifiable Data Registry",
          "action": "(some implementations) Record Keys: The Verifier uses a record identifier and retrieves the Public Keys of both the Issuer and the Holder from the registry. (This kind of registry might use distributed ledger to log proofs of issued VCs–not required.)"
        },
        {
          "stepNumber": 11,
          "actor": "Skills Registry",
          "action": "(some implementations) Returns skills metadata."
        },
        {
          "stepNumber": 12,
          "actor": "Verifier",
          "action": "Verify Cryptography: Verify that the LER was not tampered. And use keys from one or more registries to gauge relevance and trustability of the data."
        },
        {
          "stepNumber": 13,
          "actor": "Verifier",
          "action": "Check Revocation: Consult revocation registry to ensure the credential has not been revoked by the Issuer."
        },
        {
          "stepNumber": 14,
          "actor": "Verifier",
          "action": "Accept Assertion: Verifier accepts the assertion if it has not been revoked and meets desired trust thresholds."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Verifier",
          "Holder",
          "Identity Registry",
          "Skills Registry",
          "Trust Registry",
          "Verifiable Data Registry"
        ],
        "rows": [
          [
            "1",
            "Request Proof: Send a request for specific information (e.g., \"Proof of Degree\").",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "",
            "Select Credentials: The Holder selects the relevant VC(s) from their digital wallet.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "Generate Presentation: Create a Verifiable Presentation (VP)—a digital package of the selected claims.",
            "",
            "",
            "",
            ""
          ],
          [
            "4",
            "",
            "Sign Presentation: The Holder signs the VP with their own private key to prove ownership of the VC.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "Submit VP: Send the signed VP to the Verifier (via QR scan or direct link).",
            "",
            "",
            "",
            ""
          ],
          [
            "6",
            "Registry Lookup: The Verifier retrieves the Public Keys and metadata from one or more registries.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "Retrieves data from one or more registries.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "8",
            "",
            "",
            "Verify Identity: Verify that the DID belongs to the person that claims to own it.",
            "",
            "",
            ""
          ],
          [
            "9",
            "",
            "",
            "",
            "",
            "(some implementations) Linked Creds or Trust Signals: Verifier retrieves from the registry Linked Creds or other signals of  progressive trust linked to the LER and Holder.",
            ""
          ],
          [
            "10",
            "",
            "",
            "",
            "",
            "",
            "(some implementations) Record Keys: The Verifier uses a record identifier and retrieves the Public Keys of both the Issuer and the Holder from the registry. (This kind of registry might use distributed ledger to log proofs of issued VCs–not required.)"
          ],
          [
            "11",
            "",
            "",
            "",
            "(some implementations) Returns skills metadata.",
            "",
            ""
          ],
          [
            "12",
            "Verify Cryptography: Verify that the LER was not tampered. And use keys from one or more registries to gauge relevance and trustability of the data.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "13",
            "Check Revocation: Consult revocation registry to ensure the credential has not been revoked by the Issuer.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "14",
            "Accept Assertion: Verifier accepts the assertion if it has not been revoked and meets desired trust thresholds.",
            "",
            "",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "* Verifiable Presentation (VP): A temporary ...",
      "data": [
        {
          "name": "Class:Credential Definition",
          "def": "Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200087"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Credential Award Evidence",
          "def": "CredentialAwardEvidence includes a statement or reference describing the evidence that the learner met the criteria for attainment of the achievement and may be related to an AssessmentResult.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200081"
        },
        {
          "name": "Class:Credential Issuer",
          "def": "An organization or person that issues a credential.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200088"
        },
        {
          "name": "Class:Credentialing Organization",
          "def": "An institution, organization, federation, or other such group that is responsible for accrediting or endorsing an individual's preparation, skills, or performance.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200391"
        },
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        }
      ],
      "cedsClassIds": [
        "C200087",
        "C200079",
        "C200081",
        "C200088",
        "C200391",
        "C200275",
        "C200280"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 7,
          "implicit": true
        },
        {
          "standard": "CIP",
          "count": 367
        },
        {
          "standard": "CTDL",
          "count": 341
        },
        {
          "standard": "LIF",
          "count": 261
        },
        {
          "standard": "CLR",
          "count": 111
        },
        {
          "standard": "Ed-Fi",
          "count": 79
        },
        {
          "standard": "CASE",
          "count": 23
        },
        {
          "standard": "SEDM",
          "count": 4
        },
        {
          "standard": "SIF",
          "count": 3
        }
      ],
      "dependencies": "* Availability of a Verifiable Data Registry, Identity Registry or similar decentralized identifier (DID) resolver.\n* The Holder must possess a digital wallet containing a previously issued VC.",
      "outcomes": "* Trust: Automated, high-confidence verification of skills.\n* Privacy: Holders can share data without the original Issuer tracking their activity.\n* Efficiency: Immediate verification without manual back-and-forth with educational institutions.",
      "references": "* [Official EDFacts site.](https://edfacts.communities.ed.gov/#program/data-submission-organizer)"
    },
    {
      "id": "workplace-training-recognition",
      "githubIssue": 4,
      "title": "Workplace Training Recognition",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "vetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Vetted"
      ],
      "cedsDomains": [],
      "description": "A retail employee completes employer-provided customer service training and demonstrates proficiency in an online simulation exercise launched from a learning management system. The LMS issues a verifiable credential (VC) learning and employment record (LER) that is captured in the employee’s digital wallet, so that in the future the employee has verifiable evidence to show this and other employers to eliminate unnecessary re-training.\n\nIn this use case, the learning and employment record (LER), such as an OpenBadge v3, a single micro-credential assertion wrapped in a Verifiable Credential (VC) being issued to a learner’s digital wallet.",
      "objectives": "A worker, and digital wallet “Holder”, can receive a learning and employment record (LER) recognizing completion of a training unit delivered by a learning management system (LMS), the “Issuer”.",
      "scenario": "The following Use Case Diagram illustrates the interactions between the three primary actors in the \"Trust Triangle\": the Issuer, the Holder, and the Trust Registry, which may or may or not leverage distributed ledger technology. VC issuing use cases also may require registries. This use case uses an Identity Registry, Skills Registry, and optional Trust Registry.",
      "actors": [
        {
          "name": "Issuer / Issuing System",
          "role": "As Issuer, I want a Holder’s digital wallet to receive a learning and employment record (LER)."
        },
        {
          "name": "Holder / Holder’s Digital Wallet",
          "role": "I'm a learner and worker. As Holder of a digital wallet, I want my digital wallet to receive and store an LER."
        },
        {
          "name": "Identity Registry",
          "role": "Provides identity verification."
        },
        {
          "name": "Skills Registry",
          "role": "Provides skills definitions & metadata."
        },
        {
          "name": "Verifiable Data Registry",
          "role": "Provides trust signals."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Issuer / Issuing System",
          "action": "Identify Holder: Perform know your customer (see KYC use cases)."
        },
        {
          "stepNumber": 2,
          "actor": "Issuer / Issuing System",
          "action": "Generate Credential: Create a digital document with specific claims linked to a registered skill definition."
        },
        {
          "stepNumber": 3,
          "actor": "Issuer / Issuing System",
          "action": "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level."
        },
        {
          "stepNumber": 4,
          "actor": "Issuer / Issuing System",
          "action": "Sign Credential: Digitally sign the VC using the Issuer's private key."
        },
        {
          "stepNumber": 5,
          "actor": "Verifiable Data Registry",
          "action": "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
        },
        {
          "stepNumber": 6,
          "actor": "Issuer / Issuing System",
          "action": "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link)."
        },
        {
          "stepNumber": 7,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Receive & Review: The Holder receives the VC and reviews the claims."
        },
        {
          "stepNumber": 8,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Store in Wallet: Save the VC in a digital wallet for future use."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Issuer / Issuing System",
          "Holder / Holder’s Digital Wallet",
          "Identity Registry",
          "Skills Registry",
          "Verifiable Data Registry"
        ],
        "rows": [
          [
            "1",
            "Identify Holder: Perform know your customer (see KYC use cases).",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "Generate Credential: Create a digital document with specific claims linked to a registered skill definition.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level.",
            "",
            "",
            "",
            ""
          ],
          [
            "4",
            "Sign Credential: Digitally sign the VC using the Issuer's private key.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
          ],
          [
            "6",
            "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link).",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "",
            "Receive & Review: The Holder receives the VC and reviews the claims.",
            "",
            "",
            ""
          ],
          [
            "8",
            "",
            "Store in Wallet: Save the VC in a digital wallet for future use.",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "CEDS: Credential Definition Criteria Definition",
          "def": "undefined",
          "url": "http://ceds.ed.gov..."
        },
        {
          "name": "CEDS: Has Credential Condition Profile",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Profile",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Credential Condition Option",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Option",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Credential Condition Option Component",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Option Component",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Competency Definition",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Competency Definition",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Rubric",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Rubric Criterion",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric Criterion",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Rubric Criterion Level",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric Criterion Level",
          "def": "undefined",
          "url": "undefined"
        }
      ],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "* The learner / worker as Holder must have a digital wallet or passport application to receive the LER.",
      "outcomes": "* A learner worker is empowered with their data as verifiable credentials.",
      "references": "### **12. Open Comments**\n| Comment Link | Comment Text |\n| :--- | :--- |"
    },
    {
      "id": "special-education-federal-reporting-fs002",
      "githubIssue": 5,
      "title": "Special Education Federal Reporting FS002",
      "topic": "sedm",
      "subcategoryId": "sedm-edfacts",
      "subcategoryLabel": "EdFacts Reporting",
      "status": "vetted",
      "labels": [
        "Vetted"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "State EDFacts Coordinators submit data to EDFacts, a U. S. Department of Education initiative to put performance data at the center of policy, management and budget decisions for all K-12 educational programs. EDFacts centralizes performance data supplied by K-12 state education agencies (SEAs) with other data assets, such as financial grant information, within the Department to enable better analysis and use in policy development, planning and management.",
      "objectives": "As an EDFacts Coordinator, I want to assemble and validate the 19 data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirement FS002.",
      "scenario": "State education agency reporting requirements for special education.",
      "actors": [
        {
          "name": "EDFacts Coordinator / State System",
          "role": "a designated official within a State Education Agency (SEA) who acts as the primary liaison with the U.S. Department of Education (ED) for the submission of annual K-12 performance, demographic, and program data."
        },
        {
          "name": "EDFacts EDPass System",
          "role": "a modernized, centralized data submission application used by the U.S. Department of Education (ED) to collect, validate, and process elementary and secondary education data from State Education Agencies (SEAs)."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "EDFacts Coordinator / State System",
          "action": "assemble and validate the 19 data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirement FS002."
        },
        {
          "stepNumber": 2,
          "actor": "EDFacts EDPass System",
          "action": "receive, validate, and process data meeting FS002 requirements."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "EDFacts Coordinator / State System",
          "EDFacts EDPass System"
        ],
        "rows": [
          [
            "1",
            "assemble and validate the 19 data elements, automatically generate the aggregate counts, enable quality control and analysis for fact tables to fulfill EdFACTS reporting requirement FS002.",
            ""
          ],
          [
            "2",
            "",
            "receive, validate, and process data meeting FS002 requirements."
          ]
        ]
      },
      "keyConcepts": "See: https://edfacts.communities.ed.gov/#program/data-submission-organizer",
      "data": [
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Credential Definition",
          "def": "Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200087"
        },
        {
          "name": "Class:Competency Definition",
          "def": "A resource that states a capability or behavior that a person may learn or be able to do within a given context with references to potential levels of competence, a mastery threshold, and other contextualizing metadata.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200065"
        },
        {
          "name": "Schema:GetOpenBadgeCredentialsResponse JSON schema",
          "def": "JSON Schema for a verifiable credentials wrapped open badge.",
          "url": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_getopenbadgecredentialsresponse_schema.json"
        }
      ],
      "cedsClassIds": [
        "C200079",
        "C200087",
        "C200065"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 3,
          "implicit": true
        },
        {
          "standard": "CTDL",
          "count": 292
        },
        {
          "standard": "LIF",
          "count": 250
        },
        {
          "standard": "CIP",
          "count": 212
        },
        {
          "standard": "CLR",
          "count": 82
        },
        {
          "standard": "CASE",
          "count": 79
        },
        {
          "standard": "Ed-Fi",
          "count": 64
        },
        {
          "standard": "SIF",
          "count": 12
        },
        {
          "standard": "SEDM",
          "count": 2
        }
      ],
      "dependencies": "State (SEA) systems to collected, validate, and process data from local education agencies (LEA)s.",
      "outcomes": "SEA meeds federal requirements.",
      "references": "* [Official EDFacts site.](https://edfacts.communities.ed.gov/#program/data-submission-organizer)"
    },
    {
      "id": "ler-issuance-from-slds",
      "githubIssue": 6,
      "title": "LER Issuance from SLDS",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "vetted",
      "labels": [
        "P20W+LER",
        "LER",
        "Vetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "A state longitudinal data system (SLDS) exports verified course completions as machine-readable credentials into learners' wallets, making administrative records portable without manual transcript requests.\nIn this use case, the learning and employment record (LER), such as an OpenBadge v3, is a single micro-credential assertion wrapped in a Verifiable Credential (VC) being issued to a learner’s digital wallet.",
      "objectives": "A learner, a digital wallet \"Holder\", can receive verified course completion records as verifiable credentials (VC) from the state as \"Issuer\".",
      "scenario": "The following Use Case Diagram illustrates the interactions between the three primary actors in the \"Trust Triangle\": the Issuer, the Holder, and the Trust Registry, which may or may or not leverage distributed ledger technology. VC issuing use cases also may require registries. This use case uses an Identity Registry, Skills Registry, and optional Trust Registry.",
      "actors": [
        {
          "name": "Issuer / Issuing System",
          "role": "As Issuer, I want a Holder’s digital wallet to receive a learning and employment record (LER)."
        },
        {
          "name": "Holder / Holder’s Digital Wallet",
          "role": "I'm a learner and worker. As Holder of a digital wallet, I want my digital wallet to receive and store an LER."
        },
        {
          "name": "Identity Registry",
          "role": "Provides identity verification."
        },
        {
          "name": "Skills Registry",
          "role": "Provides skills definitions & metadata."
        },
        {
          "name": "Verifiable Data Registry",
          "role": "Provides trust signals."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Issuer / Issuing System",
          "action": "Identify Holder: Perform know your customer (see KYC use cases)."
        },
        {
          "stepNumber": 2,
          "actor": "Issuer / Issuing System",
          "action": "Generate Credential: Create a digital document with specific claims linked to a registered skill definition."
        },
        {
          "stepNumber": 3,
          "actor": "Issuer / Issuing System",
          "action": "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level."
        },
        {
          "stepNumber": 4,
          "actor": "Issuer / Issuing System",
          "action": "Sign Credential: Digitally sign the VC using the Issuer's private key."
        },
        {
          "stepNumber": 5,
          "actor": "Verifiable Data Registry",
          "action": "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
        },
        {
          "stepNumber": 6,
          "actor": "Issuer / Issuing System",
          "action": "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link)."
        },
        {
          "stepNumber": 7,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Receive & Review: The Holder receives the VC and reviews the claims."
        },
        {
          "stepNumber": 8,
          "actor": "Holder / Holder’s Digital Wallet",
          "action": "Store in Wallet: Save the VC in a digital wallet for future use."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Issuer / Issuing System",
          "Holder / Holder’s Digital Wallet",
          "Identity Registry",
          "Skills Registry",
          "Verifiable Data Registry"
        ],
        "rows": [
          [
            "1",
            "Identify Holder: Perform know your customer (see KYC use cases).",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "Generate Credential: Create a digital document with specific claims linked to a registered skill definition.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "Use Authoritative Skill Reference: Include globally unique URI for a registered skill definition and metadata, such as registered proficiency level.",
            "",
            "",
            "",
            ""
          ],
          [
            "4",
            "Sign Credential: Digitally sign the VC using the Issuer's private key.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "(if using a record trust registry) Publish Public Key: Store the Issuer’s DID and public key for future verification. Or attach verifiable Linked Creds."
          ],
          [
            "6",
            "Transmit VC: Securely send the signed VC to the Holder (often via QR code or direct link).",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "",
            "Receive & Review: The Holder receives the VC and reviews the claims.",
            "",
            "",
            ""
          ],
          [
            "8",
            "",
            "Store in Wallet: Save the VC in a digital wallet for future use.",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "CEDS: Has Criteria Definition",
          "def": "Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200087"
        },
        {
          "name": "CEDS: Credential Definition Criteria Definition",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Credential Condition Profile",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Profile",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Credential Condition Option",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Option",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Credential Condition Option Component",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Credential Condition Option Component",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Competency Definition",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Competency Definition",
          "def": "A resource that states a capability or behavior that a person may learn or be able to do within a given context with references to potential levels of competence, a mastery threshold, and other contextualizing metadata.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200065"
        },
        {
          "name": "CEDS: Has Rubric",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Rubric Criterion",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric Criterion",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Has Rubric Criterion Level",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "CEDS: Rubric Criterion Level",
          "def": "undefined",
          "url": "undefined"
        },
        {
          "name": "Schema:GetOpenBadgeCredentialsResponse JSON schema",
          "def": "JSON Schema for a verifiable credentials wrapped open badge.",
          "url": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_getopenbadgecredentialsresponse_schema.json"
        }
      ],
      "cedsClassIds": [
        "C200079",
        "C200087",
        "C200065"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 3,
          "implicit": true
        },
        {
          "standard": "CTDL",
          "count": 292
        },
        {
          "standard": "LIF",
          "count": 250
        },
        {
          "standard": "CIP",
          "count": 212
        },
        {
          "standard": "CLR",
          "count": 82
        },
        {
          "standard": "CASE",
          "count": 79
        },
        {
          "standard": "Ed-Fi",
          "count": 64
        },
        {
          "standard": "SIF",
          "count": 12
        },
        {
          "standard": "SEDM",
          "count": 2
        }
      ],
      "dependencies": "* The learner as Holder must have a digital wallet or passport application to receive the LER.",
      "outcomes": "* A learner is empowered with their data as verifiable credentials.",
      "references": "* [Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)\n* [Identity Registries -- Building Trust In A Digital World: Scalable Solutions For Verifiable Credential Ecosystems](https://credentialengine.org/2025/06/09/building-trust-in-a-digital-world-scalable-solutions-for-verifiable-credential-ecosystems/#:~:text=Issuer%20identity%20registries%20make%20that,to%20confirm%20the%20issuer's%20authenticity.)"
    },
    {
      "id": "privacy-preserving-proof-of-employment",
      "githubIssue": 7,
      "title": "Privacy-Preserving Proof of Employment",
      "topic": "p20w-ler",
      "subcategoryId": "ler-verifying",
      "subcategoryLabel": "LER Verifying",
      "status": "partially-vetted",
      "labels": [
        "Workforce",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "In this use case, a Holder utilizes a previously issued Learning and Employment Record (LER)—specifically a pay stub wrapped in a W3C Verifiable Credential—to prove eligibility for a government program without sharing any data from the paystub.",
      "objectives": "To prove employment during a period without exposing personal data.",
      "scenario": "The process involves cryptographic verification that the LER has not been tampered with, verifying the identity of the parties linked to the VC using an Identity Registry, Trust Registry, or Verifiable Data Registry, and a cryptographically verifiable proof in response to the question being asked. Instead of sharing the full LER (which contains sensitive salary and role data), the Holder generates a \"Zero-Knowledge Proof\" (ZKP) to prove only that they were employed during the required date range.",
      "actors": [
        {
          "name": "Verifier",
          "role": "As Verifier, I want to verify that a person was employed during a given period."
        },
        {
          "name": "Holder",
          "role": "As the holder of a digital wallet and verifiable employment and pay records I want to prove that I was employed during a period while keeping the details private."
        },
        {
          "name": "Identity Registry",
          "role": "Cryptographically verifies the identifier of the Holder and the Issuer of the employment record."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Verifier",
          "action": "Request Proof: Send a request for proof of employment between two dates."
        },
        {
          "stepNumber": 2,
          "actor": "Holder",
          "action": "Select Credentials: The Holder selects the relevant VC(s) from their digital wallet."
        },
        {
          "stepNumber": 3,
          "actor": "Holder",
          "action": "Generate Proof Presentation: Authorizes app to create a Verifiable Presentation (VP) of a zero knowledge proof."
        },
        {
          "stepNumber": 4,
          "actor": "Holder",
          "action": "Sign Presentation: The Holder signs the VP with their own private key to prove ownership of the VC."
        },
        {
          "stepNumber": 5,
          "actor": "Holder",
          "action": "Submit VP: Send the signed VP to the Verifier (via QR scan or direct link)."
        },
        {
          "stepNumber": 6,
          "actor": "Verifier",
          "action": "Verify Cryptography: Verify that the LER was not tampered with and proof is authentic and DID is owned by the person."
        },
        {
          "stepNumber": 7,
          "actor": "Identity Registry",
          "action": "Verify Identity: Verify that the DID belongs to the person that claims to own it."
        },
        {
          "stepNumber": 8,
          "actor": "Verifier",
          "action": "Accept Assertion: Verifier accepts the proof if it has been verified."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Verifier",
          "Holder",
          "Identity Registry"
        ],
        "rows": [
          [
            "1",
            "Request Proof: Send a request for proof of employment between two dates.",
            "",
            ""
          ],
          [
            "2",
            "",
            "Select Credentials: The Holder selects the relevant VC(s) from their digital wallet.",
            ""
          ],
          [
            "3",
            "",
            "Generate Proof Presentation: Authorizes app to create a Verifiable Presentation (VP) of a zero knowledge proof.",
            ""
          ],
          [
            "4",
            "",
            "Sign Presentation: The Holder signs the VP with their own private key to prove ownership of the VC.",
            ""
          ],
          [
            "5",
            "",
            "Submit VP: Send the signed VP to the Verifier (via QR scan or direct link).",
            ""
          ],
          [
            "6",
            "Verify Cryptography: Verify that the LER was not tampered with and proof is authentic and DID is owned by the person.",
            "",
            ""
          ],
          [
            "7",
            "",
            "",
            "Verify Identity: Verify that the DID belongs to the person that claims to own it."
          ],
          [
            "8",
            "Accept Assertion: Verifier accepts the proof if it has been verified.",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "* Verifiable Presentation (VP): a digitally signed, tamper-evident package created by a holder (user) from one or more verifiable credentials to share specific claims with a verifier. I\n* Zero-knowledge proof (also known as a ZK proof or ZKP) is a cryptographic method and protocol in which one party (the prover) can convince another party (the verifier) that some given statement is true, without conveying to the verifier any information beyond the mere fact of that statement's truth.",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Quarterly Employment Record",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200347"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "W3C VC",
          "def": "A verifiable credential is a specific way to express a set of claims made by an issuer, such as a driver's license or an education certificate.",
          "url": "https://www.w3.org/TR/vc-data-model-2.0/"
        },
        {
          "name": "HROS JEDx Data Model",
          "def": "",
          "url": "https://www.hropenstandards.org/standards-downloads"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200405",
        "C200347",
        "C200079",
        "C200280"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 5,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 223
        },
        {
          "standard": "CIP",
          "count": 158
        },
        {
          "standard": "CTDL",
          "count": 128
        },
        {
          "standard": "Ed-Fi",
          "count": 55
        },
        {
          "standard": "CLR",
          "count": 49
        },
        {
          "standard": "SIF",
          "count": 7
        },
        {
          "standard": "SEDM",
          "count": 3
        },
        {
          "standard": "CASE",
          "count": 1
        }
      ],
      "dependencies": "* Availability of a Verifiable Data Registry, Identity Registry or similar decentralized identifier (DID) resolver.\n* The Holder must possess a digital wallet containing a previously issued VC.",
      "outcomes": "* Trust: Automated, high-confidence verification of eligibility.\n* Privacy: Holders can share data without the original Issuer tracking their activity.\n* Efficiency: Immediate verification without manual back-and-forth.",
      "references": ""
    },
    {
      "id": "digital-wallets-verifiable-credentials-gates-2",
      "githubIssue": 12,
      "title": "Digital Wallets & Verifiable Credentials (Gates 2)",
      "topic": "p20w-ler",
      "subcategoryId": "ler-wallets",
      "subcategoryLabel": "LER Wallets & Digital Credentials",
      "status": "unvetted",
      "labels": [
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "Educational credentials remain largely paper-based, institution-bound, and difficult to verify across borders. A degree earned in Nairobi is not easily validated in New Delhi; a competency mastered in a Google Career Certificate program cannot be seamlessly combined with a university transcript. Meanwhile, half the world’s population lacks a verifiable digital identity. Without a foundational digital ID layer, credential portability remains theoretical.\nTwo parallel efforts are converging to solve this problem. First, the education standards community is building the technical infrastructure to express competency claims in CASE (Competencies and Academic Standards Exchange) as W3C Verifiable Credentials — creating tamper-proof, machine-readable assertions linked to official curriculum frameworks. Second, the Gates Foundation’s Digital Public Infrastructure (DPI) initiative is deploying national-scale digital identity systems across India, Sri Lanka, and much of Africa, with education emerging as the number one use case for credential portability.\nThe foundation committed $200 million in 2022 as part of a broader $1.27 billion pledge to advance digital ID, payment systems, and civil registries in developing countries. The 50-in-5 campaign targets 50 countries implementing at least one DPI component by 2028. In March 2025, the W3C published Verifiable Credentials 2.0 as a formal Recommendation. By 2026, more than 500 million smartphone users worldwide are projected to use digital identity wallets regularly, and the EU’s eIDAS 2.0 regulation requires every member state to provide at least one European Digital Identity Wallet by year’s end.",
      "objectives": "•\tIssue verifiable credentials from CASE competency claims: Enable educational institutions and assessment systems to take a competency claim expressed in the CASE framework and issue it as a W3C Verifiable Credential, creating a tamper-proof, machine-readable assertion linked by CASE GUID to the official curriculum standard.\n•\tStore credentials in learner-controlled digital wallets: Deliver issued VCs to standards-compliant digital wallets (e.g., MOSIP Inji, EU Digital Identity Wallet) that learners control, enabling them to collect, manage, and present credentials from multiple issuers throughout their careers.\n•\tConnect to national digital identity infrastructure: Link educational credentialing to the foundational digital ID systems being deployed by the Gates Foundation’s DPI initiative across developing nations, so that learners with a verified digital identity can receive and present portable credentials.\n•\tEnable cross-border credential verification: Ensure that credentials issued in one country or by one institution can be cryptographically verified by employers, institutions, and governments anywhere in the world, using open standards (W3C VCs, DIDs, OpenID4VCI) rather than proprietary platforms.\n•\tSupport hyperscaler certification portability: Provide a standards-based mechanism for Google, Microsoft, Amazon, and other global credentialing programs to issue portable, verifiable credentials that interoperate with institutional and government systems through Decentralized Identifiers (DIDs).",
      "scenario": "",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": "### **12. Open Comments**\n| Comment Link | Comment Text |\n| :--- | :--- |"
    },
    {
      "id": "career-navigation-advising-gates-4",
      "githubIssue": 15,
      "title": "Career Navigation & Advising (Gates 4)",
      "topic": "p20w-ler",
      "subcategoryId": "ler-other",
      "subcategoryLabel": "LER Social & Life Events",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "Unvetted"
      ],
      "cedsDomains": [],
      "description": "Career navigation today is fragmented. A student completing a degree or certificate has no reliable, machine-readable way to understand how their earned competencies map to job requirements across industries and geographies. Advisors lack tools that can dynamically connect curriculum outcomes to labor market demand. Prior Learning Assessment (PLA) — the process of evaluating experiential learning for academic credit — remains largely manual, with assessors individually mapping life and work experience to institutional competency frameworks.\nThe root cause is that competencies, skills, and credentials exist in separate, disconnected systems. Academic standards live in state curriculum frameworks. Skills taxonomies live in proprietary databases (O*NET, Lightcast, LinkedIn Skills Graph). Credential metadata lives in registries like Credential Engine. Job descriptions use inconsistent, free-text language. Without a shared, linked data layer connecting these domains, AI-powered career navigation tools can only operate within one silo at a time.\nThe Chan Zuckerberg Initiative’s Learning Commons Knowledge Graph offers a model for solving this problem. It delivers a structured network of datasets across curricula, state academic standards, and learning science research, with an MCP (Model Context Protocol) integration that connects the Knowledge Graph directly to Claude for real-time AI access. The Credential Engine (CRED) database catalogs 1.85 million unique credentials from more than 134,000 providers using CTDL (Credential Transparency Description Language), a schema explicitly designed for AI consumption. The strategic question is how to connect these assets and extend them globally.",
      "objectives": "•\tEnable AI-powered career navigation using linked competency and skills data: Build AI advising tools that can dynamically connect a learner’s demonstrated competencies (expressed in CASE) to available credentials (from the CRED/CTDL registry), job requirements (from skills taxonomies and job postings), and career pathways — all in real time.\n•\tAutomate Prior Learning Assessment (PLA): Use AI agents to query competency frameworks and credential registries to identify which credentials accept prior learning credit, what evidence is required, and how a learner’s experiential learning maps to institutional competency standards — dramatically reducing manual PLA effort.\n•\tBuild country-level knowledge graphs: Extend the Learning Commons Knowledge Graph model beyond U.S. K-12 math to map entire national education ecosystems — from primary school standards through post-secondary curricula to vocational qualifications — into structured, queryable formats, including parts not yet expressed in machine-readable form.\n•\tHarmonize skills taxonomies across education and employment: Create crosswalks between major skills frameworks (O*NET, ESCO, Lightcast, LinkedIn Skills Graph) and education competency standards (CASE), so that competencies earned in one system can be meaningfully matched to job requirements expressed in another.\n•\tLeverage the CRED database as a core AI asset: Use the 1.85 million CTDL-structured credentials in the Credential Engine Registry for AI-powered credential matching, gap analysis, career pathway mapping, and PLA automation.\n•\tConnect to the global DPI and digital wallet ecosystem: Use CTDL as a template for building credential registries in other countries, linking to the Gates Foundation’s digital public infrastructure and wallet deployments for global credential portability.",
      "scenario": "...",
      "actors": [
        {
          "name": "User",
          "role": "undefined"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": "undefined"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            "undefined"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": "### **12. Open Comments**\n| Comment Link | Comment Text |\n| :--- | :--- |"
    },
    {
      "id": "the-initial-and-ongoing-unemployment-insurance-benefit-payme",
      "githubIssue": 16,
      "title": "The initial and ongoing unemployment insurance benefit payments by state and regional organizations. (1.1)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "This use case involves a prototypical process of a worker application for UI and the approval process. The emphasis is on overpayment prevention.",
      "objectives": "Improving the accuracy, effectiveness, efficiency, and integrity of initial and continuing UI benefit payments, including the prevention and detection of overpayment and fraud.",
      "scenario": "A worker submits a claim with the UI (unemployment insurance) processor. The claim is evaluated and either accepted or rejected. If accepted, payments are begun. Periodic examinations of the worker's eligibility are made. \nThe following things are ideal components of the scenario: \n* Shortening time to detect claimant wages earned from jobs—catching sooner reduces the size of the overpayment and reduces collection costs and impact on trust fund\n* Confirming claimant wages earned and hourly rate of pay\n* Confirming employment separation and reason to determine benefit eligibility",
      "actors": [
        {
          "name": "Worker",
          "role": "submitter"
        },
        {
          "name": "Employer",
          "role": "confirms employment"
        },
        {
          "name": "State",
          "role": "payor"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Worker",
          "action": "Submits a claim to state"
        },
        {
          "stepNumber": 2,
          "actor": "State",
          "action": "State receives the claim"
        },
        {
          "stepNumber": 3,
          "actor": "Employer",
          "action": "State obtains eligibility details from Employer"
        },
        {
          "stepNumber": 4,
          "actor": "State",
          "action": "State makes eligibility decision"
        },
        {
          "stepNumber": 5,
          "actor": "Worker",
          "action": "Worker receives payment"
        },
        {
          "stepNumber": 6,
          "actor": "State",
          "action": "Ongoing auditing of worker eligibility"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Worker",
          "Employer",
          "State"
        ],
        "rows": [
          [
            "1",
            "Submits a claim to state",
            "",
            ""
          ],
          [
            "2",
            "",
            "",
            "State receives the claim"
          ],
          [
            "3",
            "",
            "State obtains eligibility details from Employer",
            ""
          ],
          [
            "4",
            "",
            "",
            "State makes eligibility decision"
          ],
          [
            "5",
            "Worker receives payment",
            "",
            ""
          ],
          [
            "6",
            "",
            "",
            "Ongoing auditing of worker eligibility"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Quarterly Employment Record",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200347"
        },
        {
          "name": "Class:Workforce Employment Quarterly Data",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200373"
        },
        {
          "name": "Class:Workforce Program Participation",
          "def": "Information about instruction and/or services provided to a person through a workforce and/or an employment development program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200375"
        },
        {
          "name": "Class:Program Participation WIOA",
          "def": "Information related to participation in workforce programs through the Workforce Innovation and Opportunity Act (WIOA).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200326"
        },
        {
          "name": "Class:Program Participation WIOA Barriers",
          "def": "Information related to barriers to employment for a person who participated in programs through the Workforce Innovation and Opportunity Act (WIOA).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200327"
        },
        {
          "name": "EmploymentStart",
          "def": "Employment start and end dates",
          "url": ""
        },
        {
          "name": "EmploymentEnt",
          "def": "Employment start and end dates",
          "url": ""
        },
        {
          "name": "WorkStatus",
          "def": "Reason for end of employment",
          "url": ""
        },
        {
          "name": "ReportingPeriod",
          "def": "Payroll period or monthly",
          "url": ""
        },
        {
          "name": "WagesEarned",
          "def": "Wages earned vs paid",
          "url": ""
        },
        {
          "name": "WagesPaid",
          "def": "Wages earned vs paid",
          "url": ""
        },
        {
          "name": "HoursWorked",
          "def": "Hours worked",
          "url": ""
        },
        {
          "name": "HourlyRate",
          "def": "Hourly rate of pay",
          "url": ""
        },
        {
          "name": "WorkerType",
          "def": "employee, 1099 worker",
          "url": ""
        },
        {
          "name": "OtherJobs",
          "def": "Other contemporaneous jobs held and pay (reported by other employers)",
          "url": ""
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200405",
        "C200347",
        "C200373",
        "C200375",
        "C200326",
        "C200327"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 7,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 106
        },
        {
          "standard": "CTDL",
          "count": 42
        },
        {
          "standard": "Ed-Fi",
          "count": 28
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        },
        {
          "standard": "SIF",
          "count": 4
        },
        {
          "standard": "SEDM",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "reemployment-of-ui-benefit-recipients-1-2",
      "githubIssue": 18,
      "title": "Reemployment of UI benefit recipients (1.2)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "Improving the reemployment of UI benefit recipients: reduced time to reemployment, increased earnings, reduced program costs, and potential for reduced unemployment insurance taxes.",
      "objectives": "Objectives include:\n* Identifying potential reemployment opportunities by using job titles, duties, and skills required from previous employment\n* Assessing reemployment pathways of similar workers by industry and occupation and earnings to identify reemployment opportunities\n* Considering education to reemployment pathways of similar workers by industry and occupation and earnings employer administrative records and linked education and training records\n\nThe objectives could be achieved without the scenario below using: \n* Reemployment guidance bulletins for newly unemployed that highlight related jobs and careers —customized by the occupation of the benefit recipient\n* Projection of average time to reemployment customized by labor market and occupation to be used for caseload monitoring\n* Provide data that enables targeted services based on state workforce priorities (e.g., demand jobs, claimants likely to exhaust)",
      "scenario": "A worker becomes unemployed and submits a UI (unemployment insurance) application. The state receives the application and processes it. In addition the state sends the application to a reemployment advisor (automated). The advisor sends the reemployment advice to the worker for use in finding new employment.",
      "actors": [
        {
          "name": "Worker",
          "role": "Submitter"
        },
        {
          "name": "State",
          "role": "Claim evaluator"
        },
        {
          "name": "Employment Advisement System",
          "role": "Analyzes the claim for employment advice."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Worker",
          "action": "Submits an application for UI"
        },
        {
          "stepNumber": 2,
          "actor": "State",
          "action": "Receives the application and evaluates the claim"
        },
        {
          "stepNumber": 3,
          "actor": "State",
          "action": "Send pertinent information to the Advisement System"
        },
        {
          "stepNumber": 4,
          "actor": "Employment Advisement System",
          "action": "Receives the information, analyzes it,  and creates personalized advice for finding employment"
        },
        {
          "stepNumber": 5,
          "actor": "Employment Advisement System",
          "action": "Sends advice to Worker"
        },
        {
          "stepNumber": 6,
          "actor": "Worker",
          "action": "Receives advice."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Worker",
          "State",
          "Employment Advisement System"
        ],
        "rows": [
          [
            "1",
            "Submits an application for UI",
            "",
            ""
          ],
          [
            "2",
            "",
            "Receives the application and evaluates the claim",
            ""
          ],
          [
            "3",
            "",
            "Send pertinent information to the Advisement System",
            ""
          ],
          [
            "4",
            "",
            "",
            "Receives the information, analyzes it,  and creates personalized advice for finding employment"
          ],
          [
            "5",
            "",
            "",
            "Sends advice to Worker"
          ],
          [
            "6",
            "Receives advice.",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Workforce Employment Quarterly Data",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200373"
        },
        {
          "name": "Class:Workforce Program Participation",
          "def": "Information about instruction and/or services provided to a person through a workforce and/or an employment development program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200375"
        },
        {
          "name": "Class:Program Participation WIOA",
          "def": "Information related to participation in workforce programs through the Workforce Innovation and Opportunity Act (WIOA).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200326"
        },
        {
          "name": "Class:Program Participation WIOA Barriers",
          "def": "Information related to barriers to employment for a person who participated in programs through the Workforce Innovation and Opportunity Act (WIOA).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200327"
        },
        {
          "name": "JobTitle",
          "def": "Job title",
          "url": ""
        },
        {
          "name": "JobDuties",
          "def": "Job duties",
          "url": ""
        },
        {
          "name": "JobSkillsReq",
          "def": "Employer job skills requirements",
          "url": ""
        },
        {
          "name": "Industry",
          "def": "",
          "url": ""
        },
        {
          "name": "Compensation",
          "def": "",
          "url": ""
        },
        {
          "name": "WorkLocation",
          "def": "",
          "url": ""
        },
        {
          "name": "PrevEmp",
          "def": "Previous Employment",
          "url": ""
        },
        {
          "name": "ReEmpPathways",
          "def": "Reemployment pathways of similar workers",
          "url": ""
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200405",
        "C200373",
        "C200375",
        "C200326",
        "C200327"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 6,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 94
        },
        {
          "standard": "CTDL",
          "count": 38
        },
        {
          "standard": "Ed-Fi",
          "count": 28
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        },
        {
          "standard": "SIF",
          "count": 4
        },
        {
          "standard": "SEDM",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "benchmarking-hr-analytics-and-talent-recruitment-and-managem",
      "githubIssue": 19,
      "title": "Benchmarking HR analytics and talent recruitment and management (2.1)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "This use case involves the improvement of state and regional benchmarking information for HR analytics and talent recruitment and management.",
      "objectives": "Goals include: \n* Ensuring company compensation and working conditions are competitive in the market\n* Recruiting, hiring, and retaining qualified labor\n* Assessing the diversity of employees and differences in compensation, advancement, and retention relative to the market",
      "scenario": "A relevant scenario is as follows: \n\n* An employer is reviewing pay and staffing to stay competitive in the local labor market, but its internal job titles do not match standard occupational categories.\n* The HR analyst uses the Job Title to Standard Occupational Classification (SOC) Matching Tool to map internal job titles to the correct occupations.\n* After the jobs are classified, the analyst uses the Labor Market Benchmark Reports to view current data on pay, hours, benefits, and worker demographics by occupation, industry, and labor market area.\n* Using this information, the employer adjusts compensation and hiring plans based on accurate job classification and up-to-date labor market benchmarks.",
      "actors": [
        {
          "name": "Employer",
          "role": ""
        },
        {
          "name": "HR Analyst",
          "role": ""
        },
        {
          "name": "SOC Matching Tool",
          "role": ""
        },
        {
          "name": "Labor Market Benchmark Reports",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Employer",
          "action": "Review pay and staffing at company"
        },
        {
          "stepNumber": 2,
          "actor": "HR Analyst",
          "action": "Opens the SOC code tool and maps current positions with current SOC codes"
        },
        {
          "stepNumber": 3,
          "actor": "SOC Matching Tool",
          "action": "Returns the current list to HR analyst"
        },
        {
          "stepNumber": 4,
          "actor": "HR Analyst",
          "action": "Receives the list and then opens the Labor Market Benchmark Reports"
        },
        {
          "stepNumber": 5,
          "actor": "Labor Market Benchmark Reports",
          "action": "Now the SOC code results are merged with the Benchmark Reports"
        },
        {
          "stepNumber": 6,
          "actor": "HR Analyst",
          "action": "Compile the information with updated pay, benefits, etc."
        },
        {
          "stepNumber": 7,
          "actor": "Employer",
          "action": "Implements new compensation and hiring plans"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Employer",
          "HR Analyst",
          "SOC Matching Tool",
          "Labor Market Benchmark Reports"
        ],
        "rows": [
          [
            "1",
            "Review pay and staffing at company",
            "",
            "",
            ""
          ],
          [
            "2",
            "",
            "Opens the SOC code tool and maps current positions with current SOC codes",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "Returns the current list to HR analyst",
            ""
          ],
          [
            "4",
            "",
            "Receives the list and then opens the Labor Market Benchmark Reports",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "Now the SOC code results are merged with the Benchmark Reports"
          ],
          [
            "6",
            "",
            "Compile the information with updated pay, benefits, etc.",
            "",
            ""
          ],
          [
            "7",
            "Implements new compensation and hiring plans",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        },
        {
          "name": "Class:Job Position",
          "def": "An entity that represents any type of job position. A job position represents an instance of a job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200180"
        },
        {
          "name": "Class:Quarterly Employment Record",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200347"
        },
        {
          "name": "Class:Workforce Employment Quarterly Data",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200373"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "Class:Competency Definition",
          "def": "A resource that states a capability or behavior that a person may learn or be able to do within a given context with references to potential levels of competence, a mastery threshold, and other contextualizing metadata.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200065"
        },
        {
          "name": "Industry",
          "def": "",
          "url": ""
        },
        {
          "name": "EmploymentSize",
          "def": "",
          "url": ""
        },
        {
          "name": "WorkLocation",
          "def": "",
          "url": ""
        },
        {
          "name": "JobTitle",
          "def": "",
          "url": ""
        },
        {
          "name": "JobDuties",
          "def": "",
          "url": ""
        },
        {
          "name": "Compensation",
          "def": "Amounts and types",
          "url": ""
        },
        {
          "name": "HourlyWags",
          "def": "",
          "url": ""
        },
        {
          "name": "Demographics",
          "def": "",
          "url": ""
        }
      ],
      "cedsClassIds": [
        "C200405",
        "C200175",
        "C200180",
        "C200347",
        "C200373",
        "C200079",
        "C200280",
        "C200065"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 8,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 268
        },
        {
          "standard": "CIP",
          "count": 156
        },
        {
          "standard": "CTDL",
          "count": 122
        },
        {
          "standard": "Ed-Fi",
          "count": 60
        },
        {
          "standard": "CASE",
          "count": 57
        },
        {
          "standard": "CLR",
          "count": 48
        },
        {
          "standard": "SIF",
          "count": 18
        },
        {
          "standard": "SEDM",
          "count": 3
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "benchmarking-current-compensation-and-providing-career-guida",
      "githubIssue": 20,
      "title": "Benchmarking current compensation and providing career guidance and job search services (3.1)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "Improve descriptive state and regional jobs data for benchmarking current compensation and providing career guidance and job search services.",
      "objectives": "* Comparing existing compensation and working conditions to others in the labor market\n* Identifying in-demand jobs/occupations for overall and for specific industries or industry sectors (e.g., critical economic development sectors) at sub-state regional level.\n* Identifying job duties, skill requirements, and education and work experience requirements\n* Identifying career pathways based on job-to-job flow data at state and sub-state levels\n* Providing better state and regional data on compensation—salaries, wage rates, benefits—for occupations including by industry and industry sector",
      "scenario": "A Student, Career Advisor, Employer, Workforce Analyst, or Economic Development Planner uses the system to better understand labor market conditions and career opportunities within a selected region, industry, or occupation area. The user begins by entering a career interest, occupation, geographic area, or industry sector. The system then gathers and integrates relevant labor market information, including job demand trends, compensation and working condition data, occupational skill and education requirements, and job-to-job transition patterns.\n\nUsing this information, the system analyzes current market conditions and produces tailored insights based on the actor’s needs. A Student may explore possible careers, required education, and expected wages. A Career Advisor may examine target occupations, required skills, and likely career transitions. An Employer may compare compensation and working conditions with the broader labor market and identify hiring challenges. A Workforce Analyst may assess occupational demand and regional trends, while an Economic Development Planner may focus on high-demand occupations in priority industry sectors.\n\nThe system then presents the results through dashboards, reports, or downloadable data, allowing each actor to make informed decisions about education, career planning, hiring, workforce development, or regional economic strategy.",
      "actors": [
        {
          "name": "Workforce Analyst",
          "role": "undefined"
        },
        {
          "name": "Employer",
          "role": "undefined"
        },
        {
          "name": "Career Advisor",
          "role": "undefined"
        },
        {
          "name": "Economic Development Planner",
          "role": "undefined"
        },
        {
          "name": "Student",
          "role": "undefined"
        },
        {
          "name": "System",
          "role": "undefined"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Student",
          "action": "inputs information such as occupation, region, industry, or career interest."
        },
        {
          "stepNumber": 2,
          "actor": "System",
          "action": "System accepts Student intput"
        },
        {
          "stepNumber": 3,
          "actor": "System",
          "action": "Integrate Labor Market Data: Aggregates demand, compensation, occupational requirements, and career pathway data."
        },
        {
          "stepNumber": 4,
          "actor": "System",
          "action": "Analyze Market Conditions: System evaluates demand trends, compensation benchmarks, and working conditions."
        },
        {
          "stepNumber": 5,
          "actor": "System",
          "action": "Access Occupational Requirements: System identifies skills, education, and experience needed for selected roles."
        },
        {
          "stepNumber": 6,
          "actor": "System",
          "action": "Evaluate Career Pathways: System maps job-to-job transitions and identifies progression opportunities."
        },
        {
          "stepNumber": 7,
          "actor": "System",
          "action": "Generate Insights: System synthesizes results into actionable insights tailored to each actor."
        },
        {
          "stepNumber": 8,
          "actor": "System",
          "action": "Deliver Results: System presents dashboards, reports, and data exports to each actor."
        },
        {
          "stepNumber": 9,
          "actor": "Student",
          "action": "Student receives advisement materials"
        },
        {
          "stepNumber": 10,
          "actor": "Workforce Analyst",
          "action": "Receives reports."
        },
        {
          "stepNumber": 11,
          "actor": "Employer",
          "action": "Receives reports."
        },
        {
          "stepNumber": 12,
          "actor": "Career Advisor",
          "action": "Receives reports."
        },
        {
          "stepNumber": 13,
          "actor": "Economic Development Planner",
          "action": "Receives reports."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Workforce Analyst",
          "Employer",
          "Career Advisor",
          "Economic Development Planner",
          "Student",
          "System"
        ],
        "rows": [
          [
            "1",
            "",
            "",
            "",
            "",
            "inputs information such as occupation, region, industry, or career interest.",
            ""
          ],
          [
            "2",
            "",
            "",
            "",
            "",
            "",
            "System accepts Student intput"
          ],
          [
            "3",
            "",
            "",
            "",
            "",
            "",
            "Integrate Labor Market Data: Aggregates demand, compensation, occupational requirements, and career pathway data."
          ],
          [
            "4",
            "",
            "",
            "",
            "",
            "",
            "Analyze Market Conditions: System evaluates demand trends, compensation benchmarks, and working conditions."
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "",
            "Access Occupational Requirements: System identifies skills, education, and experience needed for selected roles."
          ],
          [
            "6",
            "",
            "",
            "",
            "",
            "",
            "Evaluate Career Pathways: System maps job-to-job transitions and identifies progression opportunities."
          ],
          [
            "7",
            "",
            "",
            "",
            "",
            "",
            "Generate Insights: System synthesizes results into actionable insights tailored to each actor."
          ],
          [
            "8",
            "",
            "",
            "",
            "",
            "",
            "Deliver Results: System presents dashboards, reports, and data exports to each actor."
          ],
          [
            "9",
            "",
            "",
            "",
            "",
            "Student receives advisement materials",
            ""
          ],
          [
            "10",
            "Receives reports.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "11",
            "",
            "Receives reports.",
            "",
            "",
            "",
            ""
          ],
          [
            "12",
            "",
            "",
            "Receives reports.",
            "",
            "",
            ""
          ],
          [
            "13",
            "",
            "",
            "",
            "Receives reports.",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Quarterly Employment Record",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200347"
        },
        {
          "name": "Class:Workforce Employment Quarterly Data",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200373"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        },
        {
          "name": "Class:Job Position",
          "def": "An entity that represents any type of job position. A job position represents an instance of a job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200180"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200405",
        "C200347",
        "C200373",
        "C200175",
        "C200180"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 6,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 113
        },
        {
          "standard": "CTDL",
          "count": 49
        },
        {
          "standard": "Ed-Fi",
          "count": 29
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        },
        {
          "standard": "SIF",
          "count": 4
        },
        {
          "standard": "SEDM",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "improving-employment-outcomes-data-for-managing-and-improvin",
      "githubIssue": 21,
      "title": "Improving employment outcomes data for managing and improving programs and providing information for recruiting students. (4.1)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "",
      "objectives": "* Improve employment outcomes data for managing and improving programs\n* Provide information for recruiting students.",
      "scenario": "Identify Opportunities for Program Improvement\n\nA program administrator at a community college reviews the outcomes of graduates from a health information technology program. The administrator uses the system to see which occupations recent graduates entered, what they are earning, and how many remain in occupations relevant to their field of study. The administrator then reviews benchmark time series data to compare this year’s graduate outcomes with prior years and with similar programs across the region. Finally, the administrator runs a relevance assessment to compare the skills taught in the program with the skills required in the occupations graduates are entering. Based on the results, the administrator identifies opportunities to strengthen the curriculum and improve graduate wage and employment outcomes over time.\n\nOutcome:\nUser gains actionable evidence for curriculum revision and program improvement.",
      "actors": [
        {
          "name": "User",
          "role": ""
        },
        {
          "name": "System",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": "User reviews employment, wage, and relevance reports."
        },
        {
          "stepNumber": 2,
          "actor": "System",
          "action": "System highlights weak areas, such as low wage outcomes or low occupational relevance"
        },
        {
          "stepNumber": 3,
          "actor": "System",
          "action": "System identifies skills commonly required in relevant occupations but not strongly represented in the program"
        },
        {
          "stepNumber": 4,
          "actor": "User",
          "action": "User reviews recommended improvement areas"
        },
        {
          "stepNumber": 5,
          "actor": "System",
          "action": "System supports export of findings for planning and reporting"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User",
          "System"
        ],
        "rows": [
          [
            "1",
            "User reviews employment, wage, and relevance reports.",
            ""
          ],
          [
            "2",
            "",
            "System highlights weak areas, such as low wage outcomes or low occupational relevance"
          ],
          [
            "3",
            "",
            "System identifies skills commonly required in relevant occupations but not strongly represented in the program"
          ],
          [
            "4",
            "User reviews recommended improvement areas",
            ""
          ],
          [
            "5",
            "",
            "System supports export of findings for planning and reporting"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Postsecondary Student Academic Record",
          "def": "The summary level academic record for a postsecondary student including graduation information.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200336"
        },
        {
          "name": "Class:Postsecondary Student Employment",
          "def": "Employment information for a postsecondary student.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200342"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Quarterly Employment Record",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200347"
        },
        {
          "name": "Class:Program Participation Career And Technical",
          "def": "Information on a person participating in a career and technical education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200318"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200336",
        "C200342",
        "C200405",
        "C200347",
        "C200318"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 6,
          "implicit": true
        },
        {
          "standard": "CIP",
          "count": 222
        },
        {
          "standard": "LIF",
          "count": 135
        },
        {
          "standard": "CTDL",
          "count": 50
        },
        {
          "standard": "Ed-Fi",
          "count": 47
        },
        {
          "standard": "SIF",
          "count": 13
        },
        {
          "standard": "CLR",
          "count": 5
        },
        {
          "standard": "SEDM",
          "count": 1
        }
      ],
      "dependencies": "* Good longitudinal data must be available.\n* Program graduates must be followed for a minimum amount of time.",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "supply-demand-analysis-to-align-education-and-workforce-inve",
      "githubIssue": 22,
      "title": "Supply-demand analysis to align education and workforce investment to meet employer needs (5.1)",
      "topic": "p20w-ler",
      "subcategoryId": "p20w-statistics",
      "subcategoryLabel": "Government & Statistical Reporting",
      "status": "partially-vetted",
      "labels": [
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "",
      "objectives": "(see outcomes)",
      "scenario": "A workforce analyst is tasked with determining whether the current and future workforce pipeline is sufficient to meet employer demand in key industries within a specific sub-state region.\n\nThe analyst begins by selecting a region and one or more priority industries (e.g., healthcare, manufacturing, technology). The system enhances official labor market data by applying granular geographic, industry, and occupation-level detail to measures such as job growth, labor turnover, wage trends, and productivity. This allows the analyst to clearly identify which occupations are experiencing significant demand within the selected region and sectors.\n\nNext, the system analyzes the current and projected supply of workers entering these occupations. This includes individuals coming from education and training programs, workforce pipelines, and other labor market entry points. The system aligns this supply data with the same occupations, industries, and geographic scope used in the demand analysis.\n\nThe system then performs a supply–demand comparison, identifying whether the available and projected workforce is sufficient to meet employer needs. It highlights shortages, surpluses, and emerging gaps across occupations, industries, and regions.\n\nBased on this analysis, the system provides insights into whether government investments, training capacity, or incentive structures need to be adjusted. The analyst uses these insights to inform decisions such as expanding training programs, reallocating funding, or introducing targeted workforce initiatives.\n\nIn detail:\n1. Define Analysis Scope\n\t•\tUser selects:\n\t•\tSub-state region (e.g., workforce board, metro area)\n\t•\tIndustry or sector(s)\n\t•\tTime horizon (current + projection period)\n\n⸻\n\n2. Retrieve and Enhance Demand Data\n\t•\tSystem retrieves official labor market data:\n\t•\tEmployment levels and job changes\n\t•\tLabor turnover (hires, separations)\n\t•\tWage trends\n\t•\tProductivity indicators\n\t•\tSystem applies:\n\t•\tGeographic granularity (sub-state level)\n\t•\tIndustry and occupation-level detail\n\n3. Identify In-Demand Occupations\n\t•\tSystem analyzes:\n\t•\tEmployment growth\n\t•\tJob openings (replacement + new demand)\n\t•\tSystem ranks and outputs:\n\t•\tHigh-demand occupations by region and industry\n\n⸻\n\n4. Estimate Current Workforce Supply\n\t•\tSystem identifies workers currently available for these occupations:\n\t•\tExisting workforce\n\t•\tRecent program completers\n\t•\tActive job seekers (if available)\n\n⸻\n\n5. Project Future Workforce Supply\n\t•\tSystem estimates incoming workforce:\n\t•\tEducation and training pipeline outputs\n\t•\tExpected labor force entry trends\n\t•\tSystem aligns projections to:\n\t•\tOccupations\n\t•\tIndustries\n\t•\tRegion\n\n⸻\n\n6. Align Supply with Demand\n\t•\tSystem maps:\n\t•\tSupply (current + projected)\n\t•\tDemand (current + projected job openings)\n\t•\tEnsures consistency across:\n\t•\tOccupation codes\n\t•\tIndustry classifications\n\t•\tGeographic boundaries\n\n⸻\n\n7. Analyze Supply–Demand Balance\n\t•\tSystem calculates:\n\t•\tSupply vs. demand ratios\n\t•\tShortages (demand > supply)\n\t•\tSurpluses (supply > demand)\n\t•\tSystem identifies:\n\t•\tCritical gaps by occupation, industry, and region\n\t•\tTrends over time\n\n⸻\n\n8. Evaluate Workforce Sufficiency\n\t•\tSystem determines:\n\t•\tWhether current pipeline meets employer needs\n\t•\tWhether gaps are widening or narrowing\n\t•\tFlags:\n\t•\tHigh-risk occupations (persistent shortages)\n\t•\tStrategic sectors with unmet demand\n\n⸻\n\n9. Generate Policy and Investment Insights\n\t•\tSystem provides:\n\t•\tIndicators of where intervention is needed\n\t•\tSuggested focus areas for:\n\t•\tTraining expansion\n\t•\tFunding allocation\n\t•\tIncentives or workforce programs\n\n⸻\n\n10. Present Results\n\t•\tSystem delivers:\n\t•\tDashboards (regional, industry, occupation views)\n\t•\tTrend visualizations\n\t•\tGap analysis summaries\n\t•\tExportable reports",
      "actors": [
        {
          "name": "Workforce Analyst",
          "role": ""
        },
        {
          "name": "System",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Workforce Analyst",
          "action": "Define Analysis Scope"
        },
        {
          "stepNumber": 2,
          "actor": "System",
          "action": "Retrieve and Enhance Demand Data"
        },
        {
          "stepNumber": 3,
          "actor": "System",
          "action": "Identify In-Demand Occupations"
        },
        {
          "stepNumber": 4,
          "actor": "System",
          "action": "Estimate Current Workforce Supply"
        },
        {
          "stepNumber": 5,
          "actor": "System",
          "action": "Project Future Workforce Supply"
        },
        {
          "stepNumber": 6,
          "actor": "System",
          "action": "Align Supply with Demand"
        },
        {
          "stepNumber": 7,
          "actor": "System",
          "action": "Analyze Supply–Demand Balance"
        },
        {
          "stepNumber": 8,
          "actor": "System",
          "action": "Evaluate Workforce Sufficiency"
        },
        {
          "stepNumber": 9,
          "actor": "System",
          "action": "Generate Policy and Investment Insights"
        },
        {
          "stepNumber": 10,
          "actor": "System",
          "action": "Present Results"
        },
        {
          "stepNumber": 11,
          "actor": "Workforce Analyst",
          "action": "Receives results after checking system output at each step"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Workforce Analyst",
          "System"
        ],
        "rows": [
          [
            "1",
            "Define Analysis Scope",
            ""
          ],
          [
            "2",
            "",
            "Retrieve and Enhance Demand Data"
          ],
          [
            "3",
            "",
            "Identify In-Demand Occupations"
          ],
          [
            "4",
            "",
            "Estimate Current Workforce Supply"
          ],
          [
            "5",
            "",
            "Project Future Workforce Supply"
          ],
          [
            "6",
            "",
            "Align Supply with Demand"
          ],
          [
            "7",
            "",
            "Analyze Supply–Demand Balance"
          ],
          [
            "8",
            "",
            "Evaluate Workforce Sufficiency"
          ],
          [
            "9",
            "",
            "Generate Policy and Investment Insights"
          ],
          [
            "10",
            "",
            "Present Results"
          ],
          [
            "11",
            "Receives results after checking system output at each step",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Workforce Employment Quarterly Data",
          "def": "Person-level employment and earnings information from quarterly employment and earnings-related data from sources such as State UI Wage Records, the Wage Record Interchange System, or the Federal Employment Data Exchange System (FEDES).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200373"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        },
        {
          "name": "Class:Program Participation Career And Technical",
          "def": "Information on a person participating in a career and technical education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200318"
        },
        {
          "name": "Class:Career And Technical Course",
          "def": "The organization of subject matter and related learning experiences provided for the instruction of students on a regular or systematic basis, usually for a predetermined period of time (e.g., a semester or two-week workshop) to an individual or group of students (e.g., a class).",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200090"
        },
        {
          "name": "Class:K12 Student Enrollment",
          "def": "Information about a student enrollment that is unique to the K12 context.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200219"
        },
        {
          "name": "Class:Postsecondary Student Academic Record",
          "def": "The summary level academic record for a postsecondary student including graduation information.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200336"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200405",
        "C200373",
        "C200175",
        "C200318",
        "C200090",
        "C200219",
        "C200336"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 8,
          "implicit": true
        },
        {
          "standard": "CIP",
          "count": 440
        },
        {
          "standard": "SIF",
          "count": 358
        },
        {
          "standard": "LIF",
          "count": 131
        },
        {
          "standard": "Ed-Fi",
          "count": 103
        },
        {
          "standard": "CTDL",
          "count": 53
        },
        {
          "standard": "SEDM",
          "count": 8
        },
        {
          "standard": "CLR",
          "count": 6
        },
        {
          "standard": "CASE",
          "count": 2
        }
      ],
      "dependencies": "",
      "outcomes": "* The user is able to clearly identify in-demand occupations \n* The user is able to quantify workforce supply pipelines\n* The user is able to determine whether supply meets employer demand\n* The user is able to make informed decisions about workforce investments and policy actions",
      "references": ""
    },
    {
      "id": "digital-wallet-storage-control-and-selective-sharing-of-lers",
      "githubIssue": 25,
      "title": "Digital Wallet Storage, Control, and Selective Sharing of LERs",
      "topic": "p20w-ler",
      "subcategoryId": "ler-wallets",
      "subcategoryLabel": "LER Wallets & Digital Credentials",
      "status": "partially-vetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case covers the core digital wallet functionality that underpins much of the LER ecosystem. It addresses how individuals collect, store, manage, curate, and selectively share learning and employment records while preserving authenticity, portability, privacy, and user control across multiple issuers and verifiers.",
      "objectives": "Enable an individual to collect, store, manage, curate, and selectively share learning and employment records in a wallet while preserving authenticity, portability, privacy, and user control.",
      "scenario": "Wallets are the user-facing mechanism for holding LERs and verifiable credentials. These wallets are intended to let people store credentials from multiple issuers, move them across systems, and share only the information needed for a given purpose. The value of the wallet is not merely storage; it is controlled presentation, interoperability, and near-instant verification of the underlying credential.",
      "actors": [
        {
          "name": "Learner",
          "role": ""
        },
        {
          "name": "Credential Issuer",
          "role": ""
        },
        {
          "name": "Verifier",
          "role": ""
        },
        {
          "name": "Wallet Provider",
          "role": ""
        },
        {
          "name": "Trust Registry",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Credential Issuer",
          "action": "The credential issuer creates a verifiable credential or other structured LER component."
        },
        {
          "stepNumber": 2,
          "actor": "Learner",
          "action": "The learner claims or receives that credential into a wallet."
        },
        {
          "stepNumber": 3,
          "actor": "Wallet Provider",
          "action": "The wallet provider stores credentials from multiple issuers in one user-controlled location."
        },
        {
          "stepNumber": 4,
          "actor": "Learner",
          "action": "The learner reviews and curates the records to decide what to present in a particular context."
        },
        {
          "stepNumber": 5,
          "actor": "Learner",
          "action": "The learner shares a full credential or a limited presentation with a verifier."
        },
        {
          "stepNumber": 6,
          "actor": "Verifier",
          "action": "The verifier checks authenticity, issuer provenance, integrity, and status using the credential’s verification metadata."
        },
        {
          "stepNumber": 7,
          "actor": "Learner",
          "action": "The learner may repeat this process across multiple employers, education providers, agencies, or platforms without being locked into a single vendor environment."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Learner",
          "Credential Issuer",
          "Verifier",
          "Wallet Provider",
          "Trust Registry"
        ],
        "rows": [
          [
            "1",
            "",
            "The credential issuer creates a verifiable credential or other structured LER component.",
            "",
            "",
            ""
          ],
          [
            "2",
            "The learner claims or receives that credential into a wallet.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "",
            "The wallet provider stores credentials from multiple issuers in one user-controlled location.",
            ""
          ],
          [
            "4",
            "The learner reviews and curates the records to decide what to present in a particular context.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "The learner shares a full credential or a limited presentation with a verifier.",
            "",
            "",
            "",
            ""
          ],
          [
            "6",
            "",
            "",
            "The verifier checks authenticity, issuer provenance, integrity, and status using the credential’s verification metadata.",
            "",
            ""
          ],
          [
            "7",
            "The learner may repeat this process across multiple employers, education providers, agencies, or platforms without being locked into a single vendor environment.",
            "",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Credential Definition",
          "def": "Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200087"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200280",
        "C200079",
        "C200087"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 4,
          "implicit": true
        },
        {
          "standard": "CIP",
          "count": 367
        },
        {
          "standard": "CTDL",
          "count": 323
        },
        {
          "standard": "LIF",
          "count": 248
        },
        {
          "standard": "CLR",
          "count": 93
        },
        {
          "standard": "Ed-Fi",
          "count": 75
        },
        {
          "standard": "CASE",
          "count": 23
        },
        {
          "standard": "SEDM",
          "count": 4
        },
        {
          "standard": "SIF",
          "count": 3
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "skills-based-job-application-with-a-verifiable-ler",
      "githubIssue": 26,
      "title": "Skills-Based Job Application with a Verifiable LER",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "partially-vetted",
      "labels": [
        "Workforce",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "credentials",
        "workforce"
      ],
      "description": "This use case addresses the process by which an individual applies for a job using a structured, skills-based, and verifiable Learning and Employment Record (LER) rather than relying solely on a traditional unstructured resume. It covers the end-to-end flow from credential issuance through application submission and employer verification.",
      "objectives": "Enable an individual to apply for a job using a structured, skills-based, and verifiable learning and employment record instead of relying only on an unstructured resume. The goal is to improve the quality, portability, and trustworthiness of applicant data during hiring.",
      "scenario": "Job application scenarios in which a person applies for a position on a career site, and their resume/CV plus application data are sent as a structured LER-RS to an Applicant Tracking System (ATS). It also describes a wallet-based model in which the person authorizes sharing their LER-RS from a phone wallet or web app to start a job application. In the CBO pilot material, the same pattern appears as clients sharing newly awarded credentials directly with employers rather than relying on a caseworker to manually transmit information.",
      "actors": [
        {
          "name": "Learner",
          "role": ""
        },
        {
          "name": "Employer",
          "role": ""
        },
        {
          "name": "Job Board",
          "role": ""
        },
        {
          "name": "Applicant Tracking System",
          "role": ""
        },
        {
          "name": "Credential Issuer",
          "role": ""
        },
        {
          "name": "Wallet Provider",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Credential Issuer",
          "action": "The credential issuer creates one or more verifiable credentials or structured record elements for the individual."
        },
        {
          "stepNumber": 2,
          "actor": "Learner",
          "action": "The  learner receives or claims those records in a wallet or web-based application."
        },
        {
          "stepNumber": 3,
          "actor": "Learner",
          "action": "The learner selects a job opening on a career site, job board, or employer application system."
        },
        {
          "stepNumber": 4,
          "actor": "Learner",
          "action": "The learner authorizes sharing a structured LER or LER-RS for that opening."
        },
        {
          "stepNumber": 5,
          "actor": "Wallet Provider",
          "action": "The wallet provider transmits the structured application package to the ATS or employer system."
        },
        {
          "stepNumber": 6,
          "actor": "Employer",
          "action": "The employer reviews the submitted data, including skills and verified achievements."
        },
        {
          "stepNumber": 7,
          "actor": "Employer",
          "action": "The employer verifies that the credentials or record claims are authentic and unaltered."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Learner",
          "Employer",
          "Job Board",
          "Applicant Tracking System",
          "Credential Issuer",
          "Wallet Provider"
        ],
        "rows": [
          [
            "1",
            "",
            "",
            "",
            "",
            "The credential issuer creates one or more verifiable credentials or structured record elements for the individual.",
            ""
          ],
          [
            "2",
            "The  learner receives or claims those records in a wallet or web-based application.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "The learner selects a job opening on a career site, job board, or employer application system.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "4",
            "The learner authorizes sharing a structured LER or LER-RS for that opening.",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "",
            "The wallet provider transmits the structured application package to the ATS or employer system."
          ],
          [
            "6",
            "",
            "The employer reviews the submitted data, including skills and verified achievements.",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "",
            "The employer verifies that the credentials or record claims are authentic and unaltered.",
            "",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        },
        {
          "name": "Class:Job Position",
          "def": "An entity that represents any type of job position. A job position represents an instance of a job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200180"
        },
        {
          "name": "Class:Job Competency",
          "def": "The relationship between a job and the competency or competencies required for that job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200176"
        },
        {
          "name": "Class:Job Credential",
          "def": "The relationship between a job and credential or credentials required for that job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200177"
        },
        {
          "name": "Class:Competency Definition",
          "def": "A resource that states a capability or behavior that a person may learn or be able to do within a given context with references to potential levels of competence, a mastery threshold, and other contextualizing metadata.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200065"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200280",
        "C200079",
        "C200175",
        "C200180",
        "C200176",
        "C200177",
        "C200065"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 8,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 278
        },
        {
          "standard": "CTDL",
          "count": 171
        },
        {
          "standard": "CIP",
          "count": 158
        },
        {
          "standard": "Ed-Fi",
          "count": 60
        },
        {
          "standard": "CASE",
          "count": 57
        },
        {
          "standard": "CLR",
          "count": 52
        },
        {
          "standard": "SIF",
          "count": 14
        },
        {
          "standard": "SEDM",
          "count": 2
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "resume-to-structure-ler-conversion-for-reuse-across-hiring-s",
      "githubIssue": 27,
      "title": "Resume-to-Structure LER Conversion for Reuse Across Hiring Systems",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "partially-vetted",
      "labels": [
        "Workforce",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case provides an on-ramp from the traditional resume world into the LER ecosystem. It describes how a person with only an unstructured resume or CV can convert that information into a structured LER representation that can be reused across applications and potentially enriched over time with verified claims.",
      "objectives": "Enable a person with only an unstructured resume or CV to convert that information into a structured LER representation that can be reused across applications, shared with platforms, and potentially enriched over time with verified claims.",
      "scenario": "A user uploads a PDF or DOCX resume/CV and a provider extracts its content, transforms it into a structured LER-RS, and returns that structured record to the learner. The immediate purpose is to reduce repetitive data entry and allow the record to flow into job boards, ATS platforms, or other LER-enabled processes. This use case sits between the traditional resume world and the fuller LER ecosystem: it does not require the user to start with issuer-generated verifiable credentials, but it creates a structured on-ramp into that environment.",
      "actors": [
        {
          "name": "Learner",
          "role": ""
        },
        {
          "name": "Resume Parsing Service",
          "role": ""
        },
        {
          "name": "Job Board",
          "role": ""
        },
        {
          "name": "Employer/Recruiter",
          "role": ""
        },
        {
          "name": "Applicant Tracking System",
          "role": ""
        },
        {
          "name": "Wallet Provider",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Learner",
          "action": "The learner selects an existing resume or CV in PDF or DOCX format"
        },
        {
          "stepNumber": 2,
          "actor": "Learner",
          "action": "The learner uploads the document to a conversion or extraction service"
        },
        {
          "stepNumber": 3,
          "actor": "Wallet Provider",
          "action": "The wallet provider parses the resume and extracts relevant data elements"
        },
        {
          "stepNumber": 4,
          "actor": "Wallet Provider",
          "action": "The wallet provider extracts information and maps to a structure LER-RS format"
        },
        {
          "stepNumber": 5,
          "actor": "Wallet Provider",
          "action": "The wallet provider return a structured record to the learner, potentially in a wallet or web application"
        },
        {
          "stepNumber": 6,
          "actor": "Learner",
          "action": "The learner reviews, corrects, or supplements the resulting data as needed"
        },
        {
          "stepNumber": 7,
          "actor": "Learner",
          "action": "The learner can reuse the LER in job applications, job boards, ATS workflows and other LER-based exchanges"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Learner",
          "Resume Parsing Service",
          "Job Board",
          "Employer/Recruiter",
          "Applicant Tracking System",
          "Wallet Provider"
        ],
        "rows": [
          [
            "1",
            "The learner selects an existing resume or CV in PDF or DOCX format",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "The learner uploads the document to a conversion or extraction service",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "",
            "",
            "",
            "The wallet provider parses the resume and extracts relevant data elements"
          ],
          [
            "4",
            "",
            "",
            "",
            "",
            "",
            "The wallet provider extracts information and maps to a structure LER-RS format"
          ],
          [
            "5",
            "",
            "",
            "",
            "",
            "",
            "The wallet provider return a structured record to the learner, potentially in a wallet or web application"
          ],
          [
            "6",
            "The learner reviews, corrects, or supplements the resulting data as needed",
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "7",
            "The learner can reuse the LER in job applications, job boards, ATS workflows and other LER-based exchanges",
            "",
            "",
            "",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Employment",
          "def": "A specific type of Membership that represents a staff person's association with an organization, characterized by properties related to their employment over a defined period of time.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200405"
        },
        {
          "name": "Class:Postsecondary Student Academic Record",
          "def": "The summary level academic record for a postsecondary student including graduation information.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200336"
        },
        {
          "name": "Class:K12 Student Academic Record",
          "def": "The summary level academic record for a K12 student including graduation information.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200210"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200280",
        "C200079",
        "C200405",
        "C200336",
        "C200210",
        "C200175"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 7,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 229
        },
        {
          "standard": "CIP",
          "count": 174
        },
        {
          "standard": "CTDL",
          "count": 139
        },
        {
          "standard": "Ed-Fi",
          "count": 97
        },
        {
          "standard": "CLR",
          "count": 51
        },
        {
          "standard": "SIF",
          "count": 36
        },
        {
          "standard": "SEDM",
          "count": 4
        },
        {
          "standard": "CASE",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "passive-candidate-discovery-and-employer-matching-using-an-l",
      "githubIssue": 28,
      "title": "Passive Candidate Discovery and Employer Matching Using an LER",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case describes how a learner can authorize a structured LER to be made searchable on a job board or talent platform, enabling employers to discover qualified candidates and identify skill fit more efficiently. It covers both the passive-discovery model and the algorithmic matching capabilities enabled by structured LER data.",
      "objectives": "Enable a learner to authorize a structured learning and employment record to be made searchable or matchable in a job board or talent platform so employers can discover qualified candidates and identify skill fit more efficiently.",
      "scenario": "A learner shares an LER-RS with a job board so they can be searchable and discoverable by the recruiter, or shares it with a system that analyzes skills and proposes future roles. The responsible-ecosystem materials broaden that pattern by describing LER systems that can examine structured applications and resumes, present likely matches to employers, and suggest potential applicants who are a good fit even if they were not actively aware of the opportunity.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "career-pathway-navigation-opportunity-discover-using-an-ler",
      "githubIssue": 29,
      "title": "Career Pathway Navigation & Opportunity Discover Using an LER",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case describes how a structured learning and employment record can be used not just to prove past achievement, but to guide future actions. It covers the scenario in which a learner shares their LER with a system that analyzes qualifications, identifies skill gaps, and recommends career pathways, education, or training opportunities.",
      "objectives": "Enable a learner to share a structured learning and employment record so a system can analyze current qualifications, identify gaps, and recommend career pathways, education, or training opportunities aligned to future roles.",
      "scenario": "A learner shares an LER-RS with a system that analyzes skills and proposes career pathways, educational growth, training opportunities, and possible future roles. Related materials frame LERs as tools for unlocking job opportunities and career pathways, especially for people facing employment barriers, and for building progressive learning pathways tied to career goals.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "job-board-to-ats-transfer-for-partial-application-completion",
      "githubIssue": 30,
      "title": "Job Board-to-ATS Transfer for Partial Application Completion",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "This use case addresses the system-to-system handoff between a talent platform and an employer’s hiring system. It describes how a job seeker’s structured data, already held by a job board, can be transferred into an employer’s ATS to start or complete a job application with less manual re-entry.",
      "objectives": "Enable a job seeker’s structured learning and employment data, already held by a job board or similar platform, to be transferred into an employer’s ATS so a job application can be started or completed with less manual re-entry.",
      "scenario": "A learner starts with their data on a job board, begins an application, and the job board sends that data as an LER-RS to the ATS to complete the application. This is distinct from a general job application use case because the operational focus is system-to-system handoff between a talent platform and the employer’s hiring system, rather than initial credential issuance or wallet sharing.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "verification-of-program-completion-job-readiness-training",
      "githubIssue": 31,
      "title": "Verification of Program Completion & Job Readiness Training",
      "topic": "p20w-ler",
      "subcategoryId": "ler-verifying",
      "subcategoryLabel": "LER Verifying",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "workforce"
      ],
      "description": "This use case addresses how workforce and community program providers can issue trusted records of program completion and job-readiness skills. It enables participants to share digital credentials directly with employers, replacing manual back-channel confirmation with verifiable digital evidence.",
      "objectives": "Enable a workforce or community program provider to issue a trusted record of program completion and related job-readiness skills so participants can share that evidence directly with employers and employers can verify it without manual back-channel confirmation.",
      "scenario": "CBO and workforce-program settings in which participants complete job readiness or related training and need a better way to present that accomplishment to employers. Instead of relying on staff to send letters or manually confirm completion, the organization issues a digital credential or LER element that the participant can hold and share. This supports direct employer review while preserving program recognition and participant agency.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "workforce-readiness-digital-literacy-recognition-through-sta",
      "githubIssue": 32,
      "title": "Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials",
        "workforce"
      ],
      "description": "This use case covers the recognition of workforce readiness and digital literacy skills through stackable verifiable credentials. It describes a program model where learners receive progressive credentials that serve as building blocks in a broader pathway, connecting each milestone to future education or employment goals.",
      "objectives": "Enable programs to recognize workforce readiness, digital literacy, and related foundational skills through stackable verifiable credentials that learners can use to build confidence, demonstrate capability, and progress toward further education or employment opportunities.",
      "scenario": "A program in which learners participate in design challenges, gain workforce readiness and digital literacy skills, and receive stackable digital credentials reflecting progressive growth. The credentials are intended not only as markers of completion but as building blocks in a broader pathway model where each milestone helps the learner move toward future goals. The case also stresses co-design, learner agency, and the connection between credentialing and concrete next opportunities.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "employer-issued-skill-recognition-for-career-mobility-portab",
      "githubIssue": 33,
      "title": "Employer-Issued Skill Recognition for Career Mobility & Portability",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [],
      "description": "This use case describes how employers can convert workplace-developed skills and role proficiency into portable, verifiable credentials. It covers a retail pilot scenario where existing physical badging and training programs are augmented with digital verifiable credentials to make employee expertise more visible, transferable, and credible beyond the immediate workplace.",
      "objectives": "Enable an employer to turn workplace-developed skills and role proficiency into portable, verifiable credentials that workers can use for internal recognition, advancement, and external career mobility.",
      "scenario": "A retail pilot in which an employer with an existing physical badging and training program adds digital verifiable credentials, so employee expertise is more visible, transferable, and credible beyond the store environment. The same pattern appears in related community and internship pilots where credentials are designed to make lived experience, work-based learning, and role-based skill growth visible in ways that connect directly to opportunity.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "inclusive-ler-support-for-nonlinear-marginalized-worker-jour",
      "githubIssue": 34,
      "title": "Inclusive LER Support for Nonlinear & Marginalized Worker Journeys",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "unvetted",
      "labels": [
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case ensures that LER systems can accurately represent and make usable a learner's capabilities when their learning-and-work path is fragmented, nontraditional, or nonlinear. It addresses the needs of workers in frontline, low-wage, gig, immigrant/refugee, justice-impacted, or otherwise marginalized contexts where conventional record systems often fail.",
      "objectives": "Ensure LER systems can accurately represent and make usable a person’s capabilities and experiences when their learning-and-work path is fragmented, nontraditional, or nonlinear—so opportunity access does not depend on conventional proxies such as single employer tenure, linear degrees, or uninterrupted work history.",
      "scenario": "Many people’s real journeys do not resemble a clean “education → job → career ladder” model. People may hold multiple part-time jobs, move between industries, acquire skills informally, have gaps in employment, have experience that is hard to document, or face barriers that make traditional credential pathways inaccessible. Inclusive design guidance and responsible ecosystem framing position LERs as valuable only if they can support these realities without forcing people into narrow templates or over-disclosing sensitive context.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "state-or-regional-ler-ecosystem-for-talent-pipelines-pathway",
      "githubIssue": 35,
      "title": "State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination",
      "topic": "p20w-ler",
      "subcategoryId": "ler-hiring",
      "subcategoryLabel": "LER for Hiring & Career Mobility",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case describes the creation of a coordinated state or regional ecosystem in which learning, skill, credential, and employment data are connected through LERs. It draws from the Washington State/Spokane project and broader state strategy guidance, addressing cross-sector partnership, governance, and infrastructure needed to support talent pipelines and pathway coordination.",
      "objectives": "Create a coordinated state or regional ecosystem in which learning, skill, credential, and employment data can be connected through LERs to support talent pipelines, pathway navigation, opportunity matching, reporting, and cross-sector decision-making.",
      "scenario": "A Washington State / Spokane project explicitly described as a partnership among healthcare, education, workforce, and training leaders to create a Learning and Employment Record ecosystem. It frames LERs as a way to support local talent development, employment pipelines, pathway building, verified records, reporting, and agency for learners and workers. The Credential Engine Action Guide broadens that pattern into a state strategy, positioning LERs as foundational to coordinated education and workforce goals, while the CBEN report frames interoperability as the condition that allows learners to accumulate records over time and use them across employment and education systems.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "educator-licensure-teacher-talent-pipeline-using-wallet-base",
      "githubIssue": 36,
      "title": "Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case focuses on the educator licensure pathway, where aspiring or current educators assemble, control, and share a verifiable record of coursework, assessments, endorsements, and licensure artifacts. It addresses both the alternative licensure process and the Teacher Wallet model for streamlining credential verification across state and district systems.",
      "objectives": "Enable an aspiring or current educator to assemble, control, and share a verifiable record of coursework, assessments, endorsements, licensure artifacts, and related professional evidence so that licensure and hiring can happen with less manual verification and delay.",
      "scenario": "The corpus describes a teacher talent pipeline in which a worker such as a special education paraprofessional progresses through an alternative licensure path by completing degree requirements, apprenticeship or educator preparation components, and required tests, then presenting those records for licensure and employment. It also describes a Teacher Wallet model in which Praxis results, endorsements, attestations, and licenses move verifiably into a wallet and then into state licensure and HR systems.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "military-to-civilian-skill-translation-for-hiring",
      "githubIssue": 37,
      "title": "Military-to-Civilian Skill Translation for Hiring",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "LER",
        "Military",
        "Unvetted"
      ],
      "cedsDomains": [],
      "description": "This use case focuses on enabling military-connected learners to translate their service-acquired knowledge, experience, and skills into civilian-recognizable, verifiable credentials. It covers the process from identifying military competencies through mapping them to industry standards and presenting them to civilian employers.",
      "objectives": "Enable military-acquired knowledge, experience, and skills to be translated into civilian-recognizable, verifiable credentials that can be shared with employers and used in hiring.",
      "scenario": "Military-connected learners possess high-value capabilities but those capabilities are not always visible or legible within civilian labor-market systems. The documented pilot focuses on manufacturing, where military skills are aligned to industry-recognized competencies and expressed through digital badges and micro-badges held in a wallet. The resulting LER elements support a smoother transition from military service into civilian employment.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "recognition-of-informal-community-based-entrepreneurial-lear",
      "githubIssue": 38,
      "title": "Recognition of Informal, Community-Based, & Entrepreneurial Learning",
      "topic": "p20w-ler",
      "subcategoryId": "ler-issuing",
      "subcategoryLabel": "LER Issuing",
      "status": "unvetted",
      "labels": [
        "P20W+LER",
        "LER",
        "Unvetted"
      ],
      "cedsDomains": [],
      "description": "This use case addresses the recognition of learning, leadership development, and entrepreneurial growth acquired outside formal academic systems. It describes a program serving Black women leaders and entrepreneurs in which lived experience and capability are documented as portable, verifiable digital badges that can be shared with funders, collaborators, and employers.",
      "objectives": "Enable learning, leadership development, entrepreneurial growth, and other nontraditional achievements acquired outside formal academic systems to be documented as portable, verifiable records that can be used to access opportunity, support, or recognition.",
      "scenario": "A program serving Black women leaders and entrepreneurs in which lived experience, leadership growth, and entrepreneurial capability are recognized using digital badges and a wallet. The case is framed around making previously underrecognized learning and achievement more visible to external audiences such as funders, collaborators, and other opportunity providers. Related inclusive-design and CBO materials reinforce the pattern that LERs should not be restricted to formal institutional learning only.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "guardianship-consent-credentials-for-education-human-service",
      "githubIssue": 39,
      "title": "Guardianship & Consent Credentials for Education & Human Services",
      "topic": "p20w-ler",
      "subcategoryId": "ler-other",
      "subcategoryLabel": "LER Social & Life Events",
      "status": "unvetted",
      "labels": [
        "LER",
        "Human Services",
        "Unvetted"
      ],
      "cedsDomains": [
        "credentials"
      ],
      "description": "This use case describes how guardianship status and service consent can be managed through verifiable credentials rather than fragmented paper workflows. It addresses the challenge of repeated documentation and proof requests across schools and service providers, offering a credential-based model for authorization and consent.",
      "objectives": "Enable a guardian to prove guardianship status and authorize services or data sharing through verifiable credentials rather than relying on fragmented paper workflows and repeated manual proof collection.",
      "scenario": "A school and service environment needs a secure and reusable way to determine who has legal authority to act for a student and what consent has been granted for services. The current-state problem is described as repeated documentation, repeated proof requests, and fragmented data sharing across providers. A credential-based model lets the guardian hold verifiable proof of guardianship and provide scoped consent in specific transactions.",
      "actors": [
        {
          "name": "User",
          "role": ""
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "User",
          "action": ""
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "User"
        ],
        "rows": [
          [
            "1",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [],
      "cedsClassIds": [],
      "connectedStandards": [],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "privacy-preserving-selectively-disclosed-opportunity-access",
      "githubIssue": 40,
      "title": "Privacy-Preserving & Selectively Disclosed Opportunity Access",
      "topic": "p20w-ler",
      "subcategoryId": "ler-wallets",
      "subcategoryLabel": "LER Wallets & Digital Credentials",
      "status": "partially-vetted",
      "labels": [
        "P20W+LER",
        "Workforce",
        "LER",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [],
      "description": "Learning and Employment Records (LERs) can contain deeply personal information — academic history, credentials, demographic data, disability accommodations, disciplinary records, financial aid status, and employment details. When a learner pursues a new opportunity (a job, an educational program, a scholarship, a licensed profession), they are often forced into an all-or-nothing disclosure model: share the entire transcript, the full resume, or a complete credential portfolio. This creates disproportionate privacy risk relative to what the receiving party actually needs. This use case describes how a privacy-preserving, selective-disclosure architecture allows a learner to prove exactly what is required for a given opportunity — and nothing more — using verifiable, machine-readable records anchored to open data standards and the CEDS ontology.",
      "objectives": "The primary objective is to enable a learner to use a learning and employment record to pursue work, education, or services while disclosing only the information necessary for that purpose, thereby reducing privacy risk and limiting unnecessary exposure of sensitive information.\n\nSupporting objectives include:\n- Demonstrate how a learner can respond to an opportunity's requirements by presenting cryptographically verifiable claims without revealing the underlying source record in full.\n- Show how an opportunity provider can define minimum disclosure requirements in a machine-readable way, mapped to standardized data elements.\n- Illustrate the role of consent management, ensuring the learner makes an informed, revocable decision about each disclosure event.\n- Identify where selective disclosure techniques (such as zero-knowledge proofs, derived credentials, and redacted presentations) intersect with interoperability standards like CEDS, CLR, and W3C Verifiable Credentials.\n- Reduce the accumulation of unnecessary personal data by receiving parties, limiting downstream re-identification and breach exposure risk.",
      "scenario": "Maria is a working adult who completed an Associate of Applied Science in Cybersecurity from a community college two years ago and has since earned two industry certifications (CompTIA Security+ and a cloud security micro-credential from an online provider). She also completed a registered apprenticeship with a managed security services firm. All of these achievements are held as verifiable credentials in her personal digital wallet.\n\nMaria is applying for a Security Analyst position at a mid-size healthcare company. The employer's applicant tracking system publishes a machine-readable requirement profile specifying that candidates must demonstrate: (a) a post-secondary credential in a cybersecurity-related field, (b) at least one active industry certification aligned to the NICE Cybersecurity Workforce Framework at a specified proficiency level, and (c) at least 1,000 hours of documented applied work experience in a security operations role.\n\nMaria does not want to disclose her GPA, her financial aid history, her full transcript (which includes a withdrawn course), her date of birth, or any demographic information. Using her wallet application, she selects only the claims necessary to satisfy the three requirements, constructs a verifiable presentation, and submits it. The employer's system can verify the cryptographic integrity and the issuer trust chain of each claim without ever receiving Maria's full records. After review, the system confirms that the presentation satisfies the requirement profile, and Maria advances to the interview stage.",
      "actors": [
        {
          "name": "Learner",
          "role": "The data subject and sole disclosure authority who holds verifiable credentials in a personal digital wallet, reviews opportunity requirements, selects and consents to specific claim disclosures, submits verifiable presentations, and may subsequently revoke consent or request deletion of shared data."
        },
        {
          "name": "Credential Issuer",
          "role": "Any credentialing entity (educational institution, certification body, licensing authority, training provider, employer, apprenticeship sponsor, or government agency) that issues verifiable credentials with sensitive fields structured as independently disclosable claims, maps data elements to CEDS and relevant external frameworks (CIP codes, O*NET codes, competency framework identifiers), signs with a selective-disclosure-capable scheme (BBS+ or SD-JWT), registers its identity and keys with a trust registry, and maintains queryable credential status."
        },
        {
          "name": "Opportunity Provider",
          "role": "Any relying party (employer, admissions office, scholarship committee, licensing board, or social services agency) that publishes a machine-readable requirement profile referencing standardized vocabularies (CEDS elements, CIP codes, competency framework identifiers, credential category types) to specify minimum necessary claims, cryptographically verifies presentations against those requirements, queries the trust registry to confirm issuer legitimacy, enforces data minimization by retaining only verification results, and provides mechanisms for learners to exercise data rights."
        },
        {
          "name": "Wallet Provider",
          "role": "The technology provider hosting the learner's digital wallet, responsible for secure credential storage and validation, requirement-profile-to-credential matching, selective disclosure tooling and presentation construction (BBS+ proof derivation or SD-JWT) bound to the learner's DID and verifier challenge nonce, transmission via OID4VP, DIDComm, or QR exchange, and maintaining a consent and audit log of every disclosure event to support the learner's review, revocation, and evidentiary needs — all without unencrypted access to credentials unless explicitly consented to by the learner."
        },
        {
          "name": "Trust Registry",
          "role": "An entity or federated network maintaining a registry of trusted issuers, their public keys or DIDs, governance frameworks, recognized credential schemas, and revocation status endpoints, queried by the opportunity provider during verification to confirm issuer recognition, schema conformance, and credential validity."
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Credential Issuer",
          "action": "Issues one or more verifiable credentials to the learner, with claims structured as independently disclosable elements, and registers its DID and public key material with the trust registry."
        },
        {
          "stepNumber": 2,
          "actor": "Learner",
          "action": "Receives credentials into their personal digital wallet, which validates each credential's signature and confirms each issuer's DID against the trust registry."
        },
        {
          "stepNumber": 3,
          "actor": "Opportunity Provider",
          "action": "Publishes an opportunity alongside a machine-readable requirement profile specifying the minimum set of claims needed for eligibility and declaring which categories of data are not required."
        },
        {
          "stepNumber": 4,
          "actor": "Learner",
          "action": "Discovers the opportunity and loads the requirement profile into their wallet."
        },
        {
          "stepNumber": 5,
          "actor": "Wallet Provider",
          "action": "Parses the requirement profile, maps it against the learner's held credentials, and prepares a proposed disclosure set for the learner's review."
        },
        {
          "stepNumber": 6,
          "actor": "Wallet Provider",
          "action": "Presents the learner with a disclosure review screen showing which claims will be disclosed, which will be withheld, the verifier's identity, the stated purpose, and any declared retention terms."
        },
        {
          "stepNumber": 7,
          "actor": "Learner",
          "action": "Reviews and optionally adjusts the proposed presentation, then grants consent to construct and transmit it."
        },
        {
          "stepNumber": 8,
          "actor": "Wallet Provider",
          "action": "Records the consent event in the wallet's audit log, including timestamp, verifier identity, stated purpose, claims disclosed, and retention terms accepted."
        },
        {
          "stepNumber": 9,
          "actor": "Wallet Provider",
          "action": "Constructs a verifiable presentation containing only the consented claims, bound to the learner's holder DID and the opportunity provider's challenge nonce."
        },
        {
          "stepNumber": 10,
          "actor": "Learner",
          "action": "Submits the verifiable presentation to the opportunity provider."
        },
        {
          "stepNumber": 11,
          "actor": "Opportunity Provider",
          "action": "Receives the presentation and verifies it: validates the cryptographic proof on each claim, confirms each issuer against the trust registry, verifies holder binding and nonce, and checks credential status."
        },
        {
          "stepNumber": 12,
          "actor": "Trust Registry",
          "action": "Responds to the opportunity provider's queries, confirming issuer recognition, governance framework membership, credential schema conformance, and revocation status."
        },
        {
          "stepNumber": 13,
          "actor": "Opportunity Provider",
          "action": "Evaluates disclosed claims against the requirement profile, records only the verification result and a reference hash of the presentation, and advances the learner or communicates the outcome."
        },
        {
          "stepNumber": 14,
          "actor": "Learner",
          "action": "Accesses the wallet's audit log at any subsequent point to review what was shared, and may issue a deletion request to the opportunity provider using the consent record as evidence."
        },
        {
          "stepNumber": 15,
          "actor": "Opportunity Provider",
          "action": "Upon a valid deletion request or retention period expiration, purges all disclosed claim data and presentation artifacts and confirms deletion to the learner."
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Learner",
          "Credential Issuer",
          "Opportunity Provider",
          "Wallet Provider",
          "Trust Registry"
        ],
        "rows": [
          [
            "1",
            "",
            "Issues one or more verifiable credentials to the learner, with claims structured as independently disclosable elements, and registers its DID and public key material with the trust registry.",
            "",
            "",
            ""
          ],
          [
            "2",
            "Receives credentials into their personal digital wallet, which validates each credential's signature and confirms each issuer's DID against the trust registry.",
            "",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "Publishes an opportunity alongside a machine-readable requirement profile specifying the minimum set of claims needed for eligibility and declaring which categories of data are not required.",
            "",
            ""
          ],
          [
            "4",
            "Discovers the opportunity and loads the requirement profile into their wallet.",
            "",
            "",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "Parses the requirement profile, maps it against the learner's held credentials, and prepares a proposed disclosure set for the learner's review.",
            ""
          ],
          [
            "6",
            "",
            "",
            "",
            "Presents the learner with a disclosure review screen showing which claims will be disclosed, which will be withheld, the verifier's identity, the stated purpose, and any declared retention terms.",
            ""
          ],
          [
            "7",
            "Reviews and optionally adjusts the proposed presentation, then grants consent to construct and transmit it.",
            "",
            "",
            "",
            ""
          ],
          [
            "8",
            "",
            "",
            "",
            "Records the consent event in the wallet's audit log, including timestamp, verifier identity, stated purpose, claims disclosed, and retention terms accepted.",
            ""
          ],
          [
            "9",
            "",
            "",
            "",
            "Constructs a verifiable presentation containing only the consented claims, bound to the learner's holder DID and the opportunity provider's challenge nonce.",
            ""
          ],
          [
            "10",
            "Submits the verifiable presentation to the opportunity provider.",
            "",
            "",
            "",
            ""
          ],
          [
            "11",
            "",
            "",
            "Receives the presentation and verifies it: validates the cryptographic proof on each claim, confirms each issuer against the trust registry, verifies holder binding and nonce, and checks credential status.",
            "",
            ""
          ],
          [
            "12",
            "",
            "",
            "",
            "",
            "Responds to the opportunity provider's queries, confirming issuer recognition, governance framework membership, credential schema conformance, and revocation status."
          ],
          [
            "13",
            "",
            "",
            "Evaluates disclosed claims against the requirement profile, records only the verification result and a reference hash of the presentation, and advances the learner or communicates the outcome.",
            "",
            ""
          ],
          [
            "14",
            "Accesses the wallet's audit log at any subsequent point to review what was shared, and may issue a deletion request to the opportunity provider using the consent record as evidence.",
            "",
            "",
            "",
            ""
          ],
          [
            "15",
            "",
            "",
            "Upon a valid deletion request or retention period expiration, purges all disclosed claim data and presentation artifacts and confirms deletion to the learner.",
            "",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Credential",
          "def": "The credential awarded to a person.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200280"
        },
        {
          "name": "Class:Credential Award",
          "def": "Information about the award of a credential to a person or organization.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200079"
        },
        {
          "name": "Class:Job",
          "def": "An entity that represent any type of job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200175"
        },
        {
          "name": "Class:Job Position",
          "def": "An entity that represents any type of job position. A job position represents an instance of a job.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200180"
        },
        {
          "name": "Credential Award (Class)",
          "def": "C200079",
          "url": ""
        },
        {
          "name": "Credential Definition (Class)",
          "def": "C200087",
          "url": ""
        },
        {
          "name": "Credential Issuer (Class)",
          "def": "C200088",
          "url": ""
        },
        {
          "name": "Competency Framework (Class)",
          "def": "C200067",
          "url": ""
        },
        {
          "name": "Competency Definition (Class)",
          "def": "C200065",
          "url": ""
        },
        {
          "name": "Competency Set (Class)",
          "def": "C200068",
          "url": ""
        },
        {
          "name": "Organization Identification (Class)",
          "def": "C200252",
          "url": ""
        },
        {
          "name": "Credential Definition Title (Property)",
          "def": "P000893",
          "url": ""
        },
        {
          "name": "Credential Definition Category Type (Property)",
          "def": "P000892",
          "url": ""
        },
        {
          "name": "Classification of Instructional Program (CIP) Code (Property)",
          "def": "P000043",
          "url": ""
        },
        {
          "name": "Credential Award Start Date (Property)",
          "def": "P001163",
          "url": ""
        },
        {
          "name": "Credential Expiration Date (Property)",
          "def": "P000069",
          "url": ""
        },
        {
          "name": "Credential Award End Date (Property)",
          "def": "P001164",
          "url": ""
        },
        {
          "name": "Credential Award Status Type (Property)",
          "def": "P002196",
          "url": ""
        },
        {
          "name": "Credential Award Identifier (Property)",
          "def": "P002198",
          "url": ""
        },
        {
          "name": "Credential Issuer Revocation List URL (Property)",
          "def": "P001662",
          "url": ""
        },
        {
          "name": "Organization Identifier (Property)",
          "def": "P000826",
          "url": ""
        },
        {
          "name": "Organization Identification System (Property)",
          "def": "P000827",
          "url": ""
        },
        {
          "name": "Competency Framework Identifier URI (Property)",
          "def": "P000693",
          "url": ""
        },
        {
          "name": "Competency Definition Identifier (Property)",
          "def": "P000689",
          "url": ""
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200280",
        "C200079",
        "C200175",
        "C200180"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 5,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 180
        },
        {
          "standard": "CIP",
          "count": 157
        },
        {
          "standard": "CTDL",
          "count": 128
        },
        {
          "standard": "CLR",
          "count": 49
        },
        {
          "standard": "Ed-Fi",
          "count": 42
        },
        {
          "standard": "SIF",
          "count": 3
        },
        {
          "standard": "SEDM",
          "count": 2
        },
        {
          "standard": "CASE",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-child-count-and-educational-environments-reporti",
      "githubIssue": 41,
      "title": "Section 618 Child Count and Educational Environments Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "States must report unduplicated counts of children with disabilities receiving services through IDEA, including educational environment placement data. This is the foundational federal data collection, submitted through EdFacts files FS002 (school age, ages 5-kindergarten through 21) and FS089 (early childhood, ages 3–5 not in kindergarten). The Data Submission Organizer specifies that data are due on the last Monday in June (next: 7/30/2025), with a 12-month preparatory cycle beginning in October when states designate their Child Count date.",
      "objectives": "Report the unduplicated number of children with disabilities by disability category, race/ethnicity, educational environment, and age at SEA, LEA, and school levels\n- Meet the annual Child Count deadline (last Monday in June)\n- Submit a signed Child Count Certification Form to the Partner Support Center (PSC)\n- Fulfill public reporting requirements by posting data to the state website\n- Provide data that feeds Indicators 5, 6, 9, and 10",
      "scenario": "Between October and December, LEAs count all students with IEPs receiving services as of their state-designated Child Count date. Over the following months, LEAs validate data against eligibility categories, demographics, and educational environments. The SEA aggregates, validates, and creates FS002 and FS089 files, submits through EDPass by the June deadline, and resolves any data quality concerns flagged by EDPass business rules.",
      "actors": [
        {
          "name": "LEA Data Steward",
          "role": "Collects and validates local Child Count and Educational Environment data per state guidance"
        },
        {
          "name": "LEA Special Education Administrator",
          "role": "Resolves questions about individual student eligibility and placement"
        },
        {
          "name": "SEA Data Manager",
          "role": "Aggregates LEA data, creates FS002 and FS089 files, manages EDPass submission"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "LEA Data Steward",
          "action": "Counts all students with IEPs receiving services as of the state's Child Count date; records disability category, race/ethnicity, age, and educational environment"
        },
        {
          "stepNumber": 2,
          "actor": "LEA Special Education Administrator",
          "action": "Resolves data questions regarding individual student eligibility, demographics, and educational environments"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Conducts review and validation of Child Count data per state processes"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Data Manager",
          "action": "Coordinates submission timeline; begins creating FS002 and FS089 files"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Data Manager",
          "action": "Uploads FS002 (SEA, LEA, school levels) and FS089 (SEA, LEA levels) to EDPass; resolves data quality errors"
        },
        {
          "stepNumber": 6,
          "actor": "SEA Data Manager",
          "action": "Verifies all files submitted successfully before deadline; submits signed Certification Form to PSC"
        },
        {
          "stepNumber": 7,
          "actor": "SEA Data Manager",
          "action": "Posts Child Count and Educational Environments data on state website for public reporting"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "LEA Data Steward",
          "LEA Special Education Administrator",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "Counts all students with IEPs receiving services as of the state's Child Count date; records disability category, race/ethnicity, age, and educational environment",
            "",
            ""
          ],
          [
            "2",
            "",
            "Resolves data questions regarding individual student eligibility, demographics, and educational environments",
            ""
          ],
          [
            "3",
            "",
            "",
            "Conducts review and validation of Child Count data per state processes"
          ],
          [
            "4",
            "",
            "",
            "Coordinates submission timeline; begins creating FS002 and FS089 files"
          ],
          [
            "5",
            "",
            "",
            "Uploads FS002 (SEA, LEA, school levels) and FS089 (SEA, LEA levels) to EDPass; resolves data quality errors"
          ],
          [
            "6",
            "",
            "",
            "Verifies all files submitted successfully before deadline; submits signed Certification Form to PSC"
          ],
          [
            "7",
            "",
            "",
            "Posts Child Count and Educational Environments data on state website for public reporting"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:IEP Authorization",
          "def": "Information about whether an evaluation has determined if a person is authorized to receive an IEP.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200151"
        },
        {
          "name": "Class:K12 Student Enrollment",
          "def": "Information about a student enrollment that is unique to the K12 context.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200219"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:Local Education Agency Federal Reporting",
          "def": "Federal reporting status values and counts for an LEA.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200190"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200322",
        "C200151",
        "C200219",
        "C200188",
        "C200190",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 8,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 382
        },
        {
          "standard": "Ed-Fi",
          "count": 75
        },
        {
          "standard": "LIF",
          "count": 63
        },
        {
          "standard": "CTDL",
          "count": 35
        },
        {
          "standard": "SEDM",
          "count": 18
        },
        {
          "standard": "CIP",
          "count": 13
        },
        {
          "standard": "CLR",
          "count": 4
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-assessment-data-reporting",
      "githubIssue": 42,
      "title": "Section 618 Assessment Data Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "assessments",
        "implVars"
      ],
      "description": "SEAs, LEAs, and schools report the number of students with disabilities who took state assessments and received valid scores for Mathematics, Reading/Language Arts, and Science. Assessment data are included within the EdFacts assessment files for all students but are disaggregated for students with IEPs. Data are due on the second Wednesday in January (next: 1/7/2026). This collection covers six files: FS175, FS178, FS179 (Achievement) and FS185, FS188, FS189 (Participation).",
      "objectives": "Report assessment participation and proficiency rates for students with disabilities\nFeed Indicator 3 (A, B, C, D) calculations for the SPP/APR\nMeet the January submission deadline\nPost assessment data on the state website per public reporting requirements in 34 CFR §300.160(f)",
      "scenario": "After the state assessment testing window closes, the SEA aggregates participation and proficiency data, disaggregating for students with IEPs. Files are created, submitted through EDPass by the January deadline, and verified against SPP/APR prepopulated data for Indicators 3A–3D.",
      "actors": [
        {
          "name": "SEA Assessment Director",
          "role": "Aggregates statewide results; disaggregates for students with disabilities"
        },
        {
          "name": "SEA Data Manager",
          "role": "Creates and submits assessment files"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "SEA Data Manager",
          "action": "Coordinates assessment data submission timeline; begins reviewing data for the six assessment files"
        },
        {
          "stepNumber": 2,
          "actor": "SEA Assessment Director",
          "action": "Continues reviewing data accuracy with LEAs for participation and proficiency"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Reviews files with EDFacts coordinator; begins EDPass submission to identify errors"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Data Manager",
          "action": "Submits all six assessment files (FS175, FS178, FS179, FS185, FS188, FS189) before the second Wednesday deadline"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Assessment Director",
          "action": "Analyzes submitted data against SPP/APR Indicators 3A–3D; prepares narratives for slippage"
        },
        {
          "stepNumber": 6,
          "actor": "SEA Data Manager",
          "action": "Posts assessment data on state website per 34 CFR §300.160(f)"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "SEA Assessment Director",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "",
            "Coordinates assessment data submission timeline; begins reviewing data for the six assessment files"
          ],
          [
            "2",
            "Continues reviewing data accuracy with LEAs for participation and proficiency",
            ""
          ],
          [
            "3",
            "",
            "Reviews files with EDFacts coordinator; begins EDPass submission to identify errors"
          ],
          [
            "4",
            "",
            "Submits all six assessment files (FS175, FS178, FS179, FS185, FS188, FS189) before the second Wednesday deadline"
          ],
          [
            "5",
            "Analyzes submitted data against SPP/APR Indicators 3A–3D; prepares narratives for slippage",
            ""
          ],
          [
            "6",
            "",
            "Posts assessment data on state website per 34 CFR §300.160(f)"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Assessment",
          "def": "An instrument used to evaluate a person typically having at-least one AssessmentForm, AssessmentSection, and AssessmentItem.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200010"
        },
        {
          "name": "Class:Assessment Administration",
          "def": "Information for an assessment event or administration period.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200013"
        },
        {
          "name": "Class:Assessment Registration",
          "def": "Information related to a specific person registered for an Assessment Administration, assigned a specific Assessment Form for participation in one or more Assessment Sessions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200046"
        },
        {
          "name": "Class:Assessment Participant Session",
          "def": "Information about a specific person's participation in an Assessment Session.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200037"
        },
        {
          "name": "Class:Assessment Subtest",
          "def": "Information for scoring an Assessment Form based on a set of Assessment Item responses with explicit rules to produce an Assessment Subtest Result, which may be for the entire Assessment Form or one aspect of evaluation based on a subset of Assessment Items.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200051"
        },
        {
          "name": "Class:Assessment Result",
          "def": "An entity that includes information about a person's results from an assessment which may be for the entire assessment or one aspect of evaluation. The scoring method is defined by the related Assessment Subtest. The entity includes the score value and information about the score, such as a diagnostic statement.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200047"
        },
        {
          "name": "Class:Assessment Performance Level",
          "def": "Information about the performance levels that may be assigned to an Assessment Subtest Result and specifications for selecting the performance level based on a score.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200038"
        },
        {
          "name": "Class:Individualized Program Assessment",
          "def": "Information about assessment for a student under an individualized program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200162"
        },
        {
          "name": "Class:Individualized Program Assessment Accessibility Feature",
          "def": "Information about an accessibility feature specified as part of an individualized program that specifically addresses the context of an assessment taken by the student such as a screen reader or spoken instructions for a visually impaired student.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200163"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:Local Education Agency Federal Reporting",
          "def": "Federal reporting status values and counts for an LEA.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200190"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200010",
        "C200013",
        "C200046",
        "C200037",
        "C200051",
        "C200047",
        "C200038",
        "C200162",
        "C200163",
        "C200285",
        "C200322",
        "C200188",
        "C200190",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 14,
          "implicit": true
        },
        {
          "standard": "Ed-Fi",
          "count": 251
        },
        {
          "standard": "SIF",
          "count": 120
        },
        {
          "standard": "LIF",
          "count": 115
        },
        {
          "standard": "SEDM",
          "count": 42
        },
        {
          "standard": "CASE",
          "count": 22
        },
        {
          "standard": "CTDL",
          "count": 17
        },
        {
          "standard": "CIP",
          "count": 15
        },
        {
          "standard": "CLR",
          "count": 8
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-exiting-special-education-reporting",
      "githubIssue": 43,
      "title": "Section 618 Exiting Special Education Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "States and LEAs report students with disabilities ages 14–21 who were in special education at the start of the reporting period but not at the end. Exiting data feeds Indicators 1 (Graduation Rate), 2 (Dropout Rate), and 14 (Post-School Outcomes). Data are due the third Wednesday in February (next: 2/18/2026) via EdFacts file FS009.",
      "objectives": "Report all students who exited special education by basis of exit (graduation with regular diploma, dropout, maximum age, moved, deceased, etc.)\nFeed Indicator 1 and 2 calculations\nMeet the February submission deadline",
      "scenario": "After the school year ends, LEAs report students ages 14–21 who exited special education. The SEA validates exit reasons, resolves questions about dropouts versus transfers, and submits FS009 through EDPass.",
      "actors": [
        {
          "name": "LEA Data Steward",
          "role": "Reports exiting data by basis of exit"
        },
        {
          "name": "SEA Data Manager",
          "role": "Validates and submits FS009"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "LEA Data Steward",
          "action": "Reports students ages 14–21 who exited special education during the July 1–June 30 period, including basis of exit"
        },
        {
          "stepNumber": 2,
          "actor": "SEA Data Manager",
          "action": "Validates exiting data; works with LEAs to resolve questions about exit categories"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Creates FS009 file in collaboration with EDFacts coordinator"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Data Manager",
          "action": "Begins EDPass submission; resolves data quality errors"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Data Manager",
          "action": "Verifies submission at SEA and LEA levels before deadline"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "LEA Data Steward",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "Reports students ages 14–21 who exited special education during the July 1–June 30 period, including basis of exit",
            ""
          ],
          [
            "2",
            "",
            "Validates exiting data; works with LEAs to resolve questions about exit categories"
          ],
          [
            "3",
            "",
            "Creates FS009 file in collaboration with EDFacts coordinator"
          ],
          [
            "4",
            "",
            "Begins EDPass submission; resolves data quality errors"
          ],
          [
            "5",
            "",
            "Verifies submission at SEA and LEA levels before deadline"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:K12 Student Academic Record",
          "def": "The summary level academic record for a K12 student including graduation information.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200210"
        },
        {
          "name": "Class:K12 Student Enrollment",
          "def": "Information about a student enrollment that is unique to the K12 context.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200219"
        },
        {
          "name": "Class:K12 Student Dropout",
          "def": "Information about a student who has dropped out or potentially may have dropped out of a K12 school.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200216"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200322",
        "C200210",
        "C200219",
        "C200216",
        "C200188",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 8,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 403
        },
        {
          "standard": "Ed-Fi",
          "count": 100
        },
        {
          "standard": "LIF",
          "count": 69
        },
        {
          "standard": "CTDL",
          "count": 39
        },
        {
          "standard": "SEDM",
          "count": 19
        },
        {
          "standard": "CIP",
          "count": 6
        },
        {
          "standard": "CLR",
          "count": 5
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-personnel-reporting",
      "githubIssue": 44,
      "title": "Section 618 Personnel Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "States and LEAs report the number of special education teachers (FS070), related services personnel (FS099), and paraprofessionals (FS112) employed or contracted to work with children with disabilities ages 3–21. Data are collected as of the state's Child Count date and are due the third Wednesday in February (next: 2/18/2026).",
      "objectives": "Report staff FTE by classification, age group served, certification status, and qualification\nIdentify workforce gaps for Business Driver 5 (Teacher Talent Pipeline)\nMeet the February submission deadline",
      "scenario": "LEAs report all special education staff in place as of the Child Count date, including FTE counts by age group served. The SEA validates and submits three personnel files through EDPass.",
      "actors": [
        {
          "name": "LEA Human Resources Administrator",
          "role": "Reports staff FTE, qualifications, and assignments"
        },
        {
          "name": "SEA Data Manager",
          "role": "Validates and submits FS070, FS099, FS112"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "LEA Human Resources Administrator",
          "action": "Counts special education teachers, related services personnel, and paraprofessionals as of Child Count date in FTE units"
        },
        {
          "stepNumber": 2,
          "actor": "SEA Data Manager",
          "action": "Reviews and validates personnel data; resolves questions about FTE calculations and age group reporting"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Creates FS070, FS099, and FS112 files; begins EDPass submission"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Data Manager",
          "action": "Verifies submission at SEA and LEA levels before deadline"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Data Manager",
          "action": "Posts personnel data on state website for public reporting"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "LEA Human Resources Administrator",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "Counts special education teachers, related services personnel, and paraprofessionals as of Child Count date in FTE units",
            ""
          ],
          [
            "2",
            "",
            "Reviews and validates personnel data; resolves questions about FTE calculations and age group reporting"
          ],
          [
            "3",
            "",
            "Creates FS070, FS099, and FS112 files; begins EDPass submission"
          ],
          [
            "4",
            "",
            "Verifies submission at SEA and LEA levels before deadline"
          ],
          [
            "5",
            "",
            "Posts personnel data on state website for public reporting"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:K12 Staff Employment",
          "def": "Employment attributes for a K12 Staff Member.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200208"
        },
        {
          "name": "Class:Staff Credential",
          "def": "A credential held by a staff member.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200364"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        }
      ],
      "cedsClassIds": [
        "C200208",
        "C200364",
        "C200188",
        "C200204",
        "C200322"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 5,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 46
        },
        {
          "standard": "Ed-Fi",
          "count": 34
        },
        {
          "standard": "SEDM",
          "count": 12
        },
        {
          "standard": "LIF",
          "count": 2
        },
        {
          "standard": "CIP",
          "count": 2
        },
        {
          "standard": "CTDL",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-dispute-resolution-reporting",
      "githubIssue": 45,
      "title": "Section 618 Dispute Resolution Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "States report the number of written signed complaints, mediation requests, due process complaints, and expedited due process complaints. Unlike other Section 618 collections, Dispute Resolution data flows through the EMAPS IDEA Part B Dispute Resolution Survey, not through Generate ETL. Additionally, SY 2024-25 introduced new EdFacts file specifications FS227–FS230 for dispute resolution, adding a parallel EDPass submission pathway. Data are due the third Wednesday in November (next: 11/12/2025).",
      "objectives": "Report dispute resolution event counts for Indicators 15 (Resolution Sessions) and 16 (Mediation)\nSubmit data via both EMAPS survey and new FS227–FS230 EDPass files\nMeet the November submission deadline\nTrack new dispute resolution file specifications that formalize previously survey-only data",
      "scenario": "After the July 1–June 30 reporting period ends, the SEA aggregates dispute resolution data from its complaint tracking system. The data is entered into the EMAPS Dispute Resolution Survey and new FS227–FS230 files are submitted through EDPass by the November deadline.",
      "actors": [
        {
          "name": "SEA Dispute Resolution Manager",
          "role": "Compiles dispute resolution data from state tracking system"
        },
        {
          "name": "SEA Data Manager",
          "role": "Enters EMAPS survey data; creates and submits FS227–FS230 files"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "SEA Dispute Resolution Manager",
          "action": "Reviews OSEP feedback on prior submission; identifies concerns to address"
        },
        {
          "stepNumber": 2,
          "actor": "SEA Dispute Resolution Manager",
          "action": "Reviews EMAPS User Guide; begins review and validation of dispute resolution data"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Enters data into EMAPS IDEA Part B Dispute Resolution Survey; submits FS227–FS230 files via EDPass"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Dispute Resolution Manager",
          "action": "Reviews HTML report and year-to-year comparison report; saves copies"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Data Manager",
          "action": "Confirms all dispute resolution submissions completed before the third Wednesday deadline"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "SEA Dispute Resolution Manager",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "Reviews OSEP feedback on prior submission; identifies concerns to address",
            ""
          ],
          [
            "2",
            "Reviews EMAPS User Guide; begins review and validation of dispute resolution data",
            ""
          ],
          [
            "3",
            "",
            "Enters data into EMAPS IDEA Part B Dispute Resolution Survey; submits FS227–FS230 files via EDPass"
          ],
          [
            "4",
            "Reviews HTML report and year-to-year comparison report; saves copies",
            ""
          ],
          [
            "5",
            "",
            "Confirms all dispute resolution submissions completed before the third Wednesday deadline"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:IEP Authorization",
          "def": "Information about whether an evaluation has determined if a person is authorized to receive an IEP.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200151"
        },
        {
          "name": "Class:IEP Authorization Rejected",
          "def": "Information about a case in which a student was authorized for an IEP but the IEP was rejected by a parent or legal guardian.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200152"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200322",
        "C200151",
        "C200152",
        "C200188",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 7,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 56
        },
        {
          "standard": "SIF",
          "count": 55
        },
        {
          "standard": "Ed-Fi",
          "count": 45
        },
        {
          "standard": "CTDL",
          "count": 35
        },
        {
          "standard": "SEDM",
          "count": 11
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "section-618-moe-reduction-and-coordinated-early-intervening-",
      "githubIssue": 46,
      "title": "Section 618 MOE Reduction and Coordinated Early Intervening Services (CEIS) Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-section618",
      "subcategoryLabel": "Section 618 Federal Reporting",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "States report LEA/ESA allocations, maintenance of effort (MOE) reduction status, significant disproportionality status, and provision of Comprehensive CEIS (CCEIS) and voluntary CEIS, including funds reserved and number of children served. Data span multiple years and are due in August (next: 08/2025). This collection links directly to Indicators 9 and 10 (disproportionality) since LEAs identified with significant disproportionality must reserve the maximum IDEA funds for CCEIS.",
      "objectives": "Report IDEA Section 611 and 619 sub-grant allocations for every LEA/ESA\nReport MOE reduction amounts and compliance status\nReport significant disproportionality status and category by LEA\nReport CCEIS and voluntary CEIS funds reserved and students served\nMeet the August submission deadline via EMAPS and EDPass (FS231–FS238)",
      "scenario": "The SEA compiles IDEA allocation data, LEA determination letters, significant disproportionality findings, and CCEIS/CEIS expenditure data across all LEAs. Data are submitted through EMAPS and verified against allocation records.",
      "actors": [
        {
          "name": "SEA IDEA Finance Director",
          "role": "Compiles allocation, MOE, and CEIS data"
        },
        {
          "name": "SEA Data Manager",
          "role": "Enters data in EMAPS; creates EDPass files"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "SEA IDEA Finance Director",
          "action": "Gathers LEA-level allocation, MOE reduction, disproportionality status, and CEIS data"
        },
        {
          "stepNumber": 2,
          "actor": "SEA Data Manager",
          "action": "Enters data into EMAPS; checks reports for errors"
        },
        {
          "stepNumber": 3,
          "actor": "SEA Data Manager",
          "action": "Submits MOE Reduction and CEIS data via EMAPS and EDPass before deadline"
        },
        {
          "stepNumber": 4,
          "actor": "SEA IDEA Finance Director",
          "action": "Notifies LEAs identified with significant disproportionality per state procedures"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "SEA IDEA Finance Director",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "Gathers LEA-level allocation, MOE reduction, disproportionality status, and CEIS data",
            ""
          ],
          [
            "2",
            "",
            "Enters data into EMAPS; checks reports for errors"
          ],
          [
            "3",
            "",
            "Submits MOE Reduction and CEIS data via EMAPS and EDPass before deadline"
          ],
          [
            "4",
            "Notifies LEAs identified with significant disproportionality per state procedures",
            ""
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:Local Education Agency Federal Funds",
          "def": "Information on the federal funds received and distributed by the LEA under various programs.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200189"
        },
        {
          "name": "Class:State Education Agency Federal Funds",
          "def": "Information on the federal funds received by the SEA.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200206"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200322",
        "C200189",
        "C200206",
        "C200188",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 5,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 38
        },
        {
          "standard": "Ed-Fi",
          "count": 25
        },
        {
          "standard": "SEDM",
          "count": 9
        },
        {
          "standard": "CIP",
          "count": 1
        },
        {
          "standard": "LIF",
          "count": 1
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "idea-part-c-early-intervention-reporting",
      "githubIssue": 47,
      "title": "IDEA Part C Early Intervention Reporting",
      "topic": "sedm",
      "subcategoryId": "sedm-idea",
      "subcategoryLabel": "IDEA Compliance",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "The SY 2024-25 EdFacts file specifications include FS901–FS908 for IDEA Part C, covering infants and toddlers (birth through age 2). These files were not addressed in the original SEDM Conceptual Model, which focused on Part B. However, Part C data is critical for Indicator 12 (Early Childhood Transition from Part C to Part B by age 3) and for the broader Child Find continuum.",
      "objectives": "Report infants and toddlers with disabilities receiving early intervention services (FS902, FS905)\nReport Part C exiting data (FS901) and continuing early intervention data (FS903)\nReport at-risk infants and toddlers (FS904)\nReport Part C dispute resolution data (FS906–FS908)\nSupport Indicator 12: percent of children found Part B eligible with IEP implemented by 3rd birthday",
      "scenario": "A state's Part C lead agency (which may differ from the SEA) compiles data on infants and toddlers receiving early intervention under IDEA Part C. The data are submitted through EDPass and feed into the Part C SPP/APR indicators.",
      "actors": [
        {
          "name": "Part C Lead Agency Data Manager",
          "role": "Compiles and submits Part C EdFacts files"
        },
        {
          "name": "Part C Early Intervention Coordinator",
          "role": "Tracks service counts, settings, and exits"
        },
        {
          "name": "SEA Data Manager",
          "role": "Coordinates Part B/Part C data alignment"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "Part C Early Intervention Coordinator",
          "action": "Counts infants and toddlers receiving early intervention services on the Child Count date"
        },
        {
          "stepNumber": 2,
          "actor": "Part C Lead Agency Data Manager",
          "action": "Creates FS901 (Exiting), FS902 (Early Intervention), FS903 (Continuing), FS904 (At-Risk), FS905 (Cumulative Count) files"
        },
        {
          "stepNumber": 3,
          "actor": "Part C Lead Agency Data Manager",
          "action": "Creates FS906 (Written Complaints), FS907 (Mediation), FS908 (Due Process) dispute resolution files"
        },
        {
          "stepNumber": 4,
          "actor": "Part C Lead Agency Data Manager",
          "action": "Submits all Part C files through EDPass by applicable deadlines"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Data Manager",
          "action": "Cross-references Part C data with Part B Indicator 12 to track timely transition of children from Part C to Part B by age 3"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Part C Lead Agency Data Manager",
          "Part C Early Intervention Coordinator",
          "SEA Data Manager"
        ],
        "rows": [
          [
            "1",
            "",
            "Counts infants and toddlers receiving early intervention services on the Child Count date",
            ""
          ],
          [
            "2",
            "Creates FS901 (Exiting), FS902 (Early Intervention), FS903 (Continuing), FS904 (At-Risk), FS905 (Cumulative Count) files",
            "",
            ""
          ],
          [
            "3",
            "Creates FS906 (Written Complaints), FS907 (Mediation), FS908 (Due Process) dispute resolution files",
            "",
            ""
          ],
          [
            "4",
            "Submits all Part C files through EDPass by applicable deadlines",
            "",
            ""
          ],
          [
            "5",
            "",
            "",
            "Cross-references Part C data with Part B Indicator 12 to track timely transition of children from Part C to Part B by age 3"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Early Learning Child Developmental Assessment",
          "def": "Information about an assessment used in the context of early learning.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200095"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200095",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 4,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 56
        },
        {
          "standard": "SIF",
          "count": 37
        },
        {
          "standard": "CTDL",
          "count": 35
        },
        {
          "standard": "Ed-Fi",
          "count": 25
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        },
        {
          "standard": "SEDM",
          "count": 3
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "child-find-and-identification-including-disproportionality-m",
      "githubIssue": 48,
      "title": "Child Find and Identification (Including Disproportionality Monitoring)",
      "topic": "sedm",
      "subcategoryId": "sedm-idea",
      "subcategoryLabel": "IDEA Compliance",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "Under IDEA §1412, all children with disabilities must be identified, located, and evaluated (Child Find). States must monitor for disproportionate representation by race/ethnicity in identification (Indicator 9) and in specific disability categories (Indicator 10). The EdFacts Data Submission Organizer connects this directly to the Child Count collection (FS002, FS089), which provides the numerator data, while general education membership data (FS052) provides denominators.",
      "objectives": "Proactively identify all children birth through age 21 suspected of having disabilities\nMonitor disproportionality using Child Count (FS002) and membership (FS052) data\nTrigger CCEIS requirements for LEAs found significantly disproportionate (linked to MOE/CEIS reporting in Use Case 1.7)\nSupport pre-referral interventions (RTI/MTSS) without delaying formal evaluation",
      "scenario": "An SEA analyzes FS002 (Child Count by race/ethnicity and disability category) against FS052 (total membership by race/ethnicity) to calculate risk ratios. Districts exceeding the state's significant disproportionality threshold must reserve maximum IDEA funds for CCEIS and publicly report on policy revisions. This data flows bidirectionally: Child Count informs disproportionality analysis, and disproportionality findings trigger MOE/CEIS reporting requirements.",
      "actors": [
        {
          "name": "General Education Teacher",
          "role": "Identifies struggling students; implements MTSS interventions"
        },
        {
          "name": "Parent/Guardian",
          "role": "May initiate referral at any time"
        },
        {
          "name": "LEA Special Education Administrator",
          "role": "Oversees referral intake; tracks Child Find data"
        },
        {
          "name": "SEA Compliance Monitor",
          "role": "Calculates risk ratios for Indicators 9 and 10 using FS002 and FS052 data"
        },
        {
          "name": "SEA IDEA Finance Director",
          "role": "Notifies LEAs with significant disproportionality of CCEIS requirements"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "General Education Teacher",
          "action": "Identifies student struggling academically or behaviorally; implements tiered MTSS interventions"
        },
        {
          "stepNumber": 2,
          "actor": "Parent/Guardian",
          "action": "Initiates formal referral for special education evaluation"
        },
        {
          "stepNumber": 3,
          "actor": "LEA Special Education Administrator",
          "action": "Logs referral; ensures timely processing regardless of MTSS status"
        },
        {
          "stepNumber": 4,
          "actor": "SEA Compliance Monitor",
          "action": "After Child Count submission, disaggregates FS002 data by race/ethnicity against FS052 membership to calculate risk ratios (Indicators 9, 10)"
        },
        {
          "stepNumber": 5,
          "actor": "SEA Compliance Monitor",
          "action": "Identifies LEAs with significant disproportionality; requires policy/practice review"
        },
        {
          "stepNumber": 6,
          "actor": "SEA IDEA Finance Director",
          "action": "Requires significantly disproportionate LEAs to reserve maximum IDEA funds for CCEIS (linked to Use Case 1.7)"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "General Education Teacher",
          "Parent/Guardian",
          "LEA Special Education Administrator",
          "SEA Compliance Monitor",
          "SEA IDEA Finance Director"
        ],
        "rows": [
          [
            "1",
            "Identifies student struggling academically or behaviorally; implements tiered MTSS interventions",
            "",
            "",
            "",
            ""
          ],
          [
            "2",
            "",
            "Initiates formal referral for special education evaluation",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "Logs referral; ensures timely processing regardless of MTSS status",
            "",
            ""
          ],
          [
            "4",
            "",
            "",
            "",
            "After Child Count submission, disaggregates FS002 data by race/ethnicity against FS052 membership to calculate risk ratios (Indicators 9, 10)",
            ""
          ],
          [
            "5",
            "",
            "",
            "",
            "Identifies LEAs with significant disproportionality; requires policy/practice review",
            ""
          ],
          [
            "6",
            "",
            "",
            "",
            "",
            "Requires significantly disproportionate LEAs to reserve maximum IDEA funds for CCEIS (linked to Use Case 1.7)"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:K12 Student Enrollment",
          "def": "Information about a student enrollment that is unique to the K12 context.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200219"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200322",
        "C200219",
        "C200188",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 6,
          "implicit": true
        },
        {
          "standard": "SIF",
          "count": 382
        },
        {
          "standard": "Ed-Fi",
          "count": 74
        },
        {
          "standard": "LIF",
          "count": 63
        },
        {
          "standard": "CTDL",
          "count": 35
        },
        {
          "standard": "SEDM",
          "count": 18
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    },
    {
      "id": "initial-referral-and-evaluation",
      "githubIssue": 49,
      "title": "Initial Referral and Evaluation",
      "topic": "sedm",
      "subcategoryId": "sedm-idea",
      "subcategoryLabel": "IDEA Compliance",
      "status": "partially-vetted",
      "labels": [
        "SEDM",
        "Partially Vetted",
        "under review"
      ],
      "cedsDomains": [
        "k12",
        "implVars"
      ],
      "description": "IDEA §1414 requires that once parental consent is obtained, a comprehensive evaluation must be completed within 60 calendar days (or state-established timeframe). Indicator 11 measures the percentage of children evaluated within the required timeframe. The Data Submission Organizer does not collect Indicator 11 data through EdFacts files—it is reported via state-selected data in the SPP/APR—but the underlying student-level data must be maintained in state systems to calculate this indicator.",
      "objectives": "Obtain informed written parental consent before evaluation\nComplete comprehensive multidisciplinary evaluation within 60 days (or state timeframe)\nTrack Standard Event Milestones: Parental Consent for Evaluation Given, Evaluation Complete\nCalculate Indicator 11 from state-maintained data",
      "scenario": "A parent requests an evaluation. The LEA obtains consent, assembles a multidisciplinary team, and completes the evaluation within the statutory timeframe. The dates are recorded as Standard Event Milestones for compliance tracking.",
      "actors": [
        {
          "name": "Parent/Guardian",
          "role": "Provides informed consent; receives evaluation report"
        },
        {
          "name": "LEA Special Education Administrator",
          "role": "Manages referral processing and compliance timelines"
        },
        {
          "name": "Multidisciplinary Evaluation Team",
          "role": "Conducts comprehensive evaluation"
        },
        {
          "name": "SEA Compliance Monitor",
          "role": "Calculates Indicator 11 from state-maintained SEM data"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "actor": "LEA Special Education Administrator",
          "action": "Provides prior written notice to parent describing proposed evaluation"
        },
        {
          "stepNumber": 2,
          "actor": "Parent/Guardian",
          "action": "Provides written informed consent (SEM: Parental Consent for Evaluation Given)"
        },
        {
          "stepNumber": 3,
          "actor": "Multidisciplinary Evaluation Team",
          "action": "Conducts comprehensive, non-discriminatory evaluation in child's native language"
        },
        {
          "stepNumber": 4,
          "actor": "Multidisciplinary Evaluation Team",
          "action": "Completes evaluation within 60 days of consent (SEM: Evaluation Complete)"
        },
        {
          "stepNumber": 5,
          "actor": "LEA Special Education Administrator",
          "action": "Provides evaluation report to parent in home language"
        },
        {
          "stepNumber": 6,
          "actor": "SEA Compliance Monitor",
          "action": "Calculates Indicator 11: percent evaluated within required timeframe"
        }
      ],
      "swimlane": {
        "headers": [
          "#",
          "Parent/Guardian",
          "LEA Special Education Administrator",
          "Multidisciplinary Evaluation Team",
          "SEA Compliance Monitor"
        ],
        "rows": [
          [
            "1",
            "",
            "Provides prior written notice to parent describing proposed evaluation",
            "",
            ""
          ],
          [
            "2",
            "Provides written informed consent (SEM: Parental Consent for Evaluation Given)",
            "",
            "",
            ""
          ],
          [
            "3",
            "",
            "",
            "Conducts comprehensive, non-discriminatory evaluation in child's native language",
            ""
          ],
          [
            "4",
            "",
            "",
            "Completes evaluation within 60 days of consent (SEM: Evaluation Complete)",
            ""
          ],
          [
            "5",
            "",
            "Provides evaluation report to parent in home language",
            "",
            ""
          ],
          [
            "6",
            "",
            "",
            "",
            "Calculates Indicator 11: percent evaluated within required timeframe"
          ]
        ]
      },
      "keyConcepts": "",
      "data": [
        {
          "name": "Class:Person",
          "def": "A human being, alive or deceased, as recognized by each jurisdiction's legal definitions.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200275"
        },
        {
          "name": "Class:Person Disability",
          "def": "The disability status for an individual and their primary disability.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200285"
        },
        {
          "name": "Class:Individualized Program Assessment",
          "def": "Information about assessment for a student under an individualized program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200162"
        },
        {
          "name": "Class:Program Participation Special Education",
          "def": "Information on a person participating in a special education program.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200322"
        },
        {
          "name": "Class:Local Education Agency",
          "def": "An administrative unit within K-12 education at the local level which exists primarily to operate schools or to contract for educational services. These units may or may not be co-extensive with county, city, or town boundaries.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200188"
        },
        {
          "name": "Class:State Education Agency",
          "def": "The SEA is the state-level entity primarily responsible for the supervision of the state's public elementary and secondary schools.",
          "url": "https://ceds.ed.gov/desHome.aspx#/all/classes/details/C200204"
        }
      ],
      "cedsClassIds": [
        "C200275",
        "C200285",
        "C200162",
        "C200322",
        "C200188",
        "C200204"
      ],
      "connectedStandards": [
        {
          "standard": "CEDS",
          "count": 6,
          "implicit": true
        },
        {
          "standard": "LIF",
          "count": 56
        },
        {
          "standard": "SIF",
          "count": 55
        },
        {
          "standard": "Ed-Fi",
          "count": 45
        },
        {
          "standard": "CTDL",
          "count": 35
        },
        {
          "standard": "SEDM",
          "count": 11
        },
        {
          "standard": "CLR",
          "count": 4
        },
        {
          "standard": "CIP",
          "count": 4
        }
      ],
      "dependencies": "",
      "outcomes": "",
      "references": ""
    }
  ],
  "stats": {
    "total": 40,
    "vetted": 4,
    "partiallyVetted": 22,
    "unvetted": 14
  }
} as {
  taxonomy: UseCaseTopic[];
  useCases: GithubUseCase[];
  stats: { total: number; vetted: number; partiallyVetted: number; unvetted: number };
};

export const taxonomy = githubUseCaseData.taxonomy;
export const useCases = githubUseCaseData.useCases;
export const stats = githubUseCaseData.stats;

const byId = new Map<string, GithubUseCase>();
for (const uc of useCases) byId.set(uc.id, uc);

export function useCaseById(id: string): GithubUseCase | null {
  return byId.get(id) || null;
}

export function subcategoryOfUseCase(id: string): { topic: UseCaseTopic; subcategory: UseCaseSubcategory } | null {
  for (const topic of taxonomy) {
    for (const sub of topic.children) {
      if (sub.children.includes(id)) return { topic, subcategory: sub };
    }
  }
  return null;
}

const STANDARD_LABELS: Record<string, string> = {
  CEDS: 'Common Education Data Standards (CEDS)',
  'Ed-Fi': 'Ed-Fi Data Standard',
  SIF: 'Schools Interoperability Framework (SIF)',
  SEDM: 'Special Education Data Model (SEDM)',
  CTDL: 'Credential Transparency Description Language (CTDL)',
  LIF: 'Learner Information Framework (LIF)',
  CASE: 'Competency & Academic Standards Exchange (CASE)',
  CLR: 'Comprehensive Learner Record (CLR)',
  CIP: 'Classification of Instructional Programs (CIP)',
  JEDx: 'Jobs & Employment Data Exchange (JEDx)',
  PESC: 'Postsecondary Electronic Standards Council (PESC)',
};

export function standardLabel(code: string): string {
  return STANDARD_LABELS[code] || code;
}
