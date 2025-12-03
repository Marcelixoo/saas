# Fashion Catalog API - Architecture Diagrams

## 1. GCP Cloud Architecture Diagram

```mermaid
---
config:
  layout: elk
  theme: base
---
flowchart LR
    subgraph Edge["Edge & DNS"]
        n1["Vercel DNS"]
        n2["Cloud Armor"]
    end

    subgraph Compute["Compute & Runtime"]
        n3["Cloud Load Balancer"]
        n4["Cloud Run"]
        n5["VPC Connector"]
    end

    subgraph Data["Data & Storage"]
        n6["Cloud SQL PostgreSQL"]
        n7["Secret Manager"]
        n8["Cloud Storage"]
    end

    subgraph Observability["Monitoring & Logs"]
        n9["Cloud Logging"]
        n10["Cloud Monitoring"]
        n11["Cloud Trace"]
    end

    subgraph External["External Services"]
        n12["GitHub Container Registry"]
        n13["Meilisearch"]
    end

    Edge --> Compute
    Compute --> Data
    Compute --> Observability
    External --> Compute

    n1 --> n2
    n2 --> n3
    n3 --> n4
    n4 --> n5
    n5 --> n6
    n4 --> n7
    n4 --> n9
    n4 --> n10
    n4 --> n11
    n6 --> n8
    n12 --> n4
    n4 --> n13

    n1@{ shape: cloud, label: "Vercel DNS<br/>api.yourdomain.com" }
    n2@{ shape: lean-r, label: "Cloud Armor<br/>DDoS Protection" }
    n3@{ shape: lin-cyl, label: "Load Balancer" }
    n4@{ shape: rect, label: "Cloud Run<br/>Min: 1, Max: 3<br/>512Mi, 1 vCPU" }
    n5@{ shape: trap-b, label: "VPC Connector<br/>10.8.0.0/28" }
    n6@{ shape: cyl, label: "Cloud SQL<br/>PostgreSQL 15<br/>Private IP" }
    n7@{ shape: docs, label: "Secret Manager<br/>JWT & DB Creds" }
    n8@{ shape: lin-cyl, label: "Cloud Storage<br/>Terraform State" }
    n9@{ shape: doc, label: "Cloud Logging" }
    n10@{ shape: notch-rect, label: "Cloud Monitoring" }
    n11@{ shape: hex, label: "Cloud Trace" }
    n12@{ shape: lin-cyl, label: "GitHub Container<br/>Registry" }
    n13@{ shape: stadium, label: "Meilisearch" }
```

## 2. CI/CD Pipeline Diagram

```mermaid
---
config:
  layout: elk
  theme: base
---
flowchart LR
    subgraph Left["Development & Build"]
        direction TB
        p1["Developer"]
        p2["Local Testing"]
        p3["GitHub"]
        p4["Code Review"]
        p5["Checkout"]
        p6["Unit Tests"]
        p7["Coverage"]
        p1 --> p2
        p2 --> p3
        p3 --> p4
        p4 --> p5
        p5 --> p6
        p6 --> p7
    end

    subgraph Middle["Container & Deploy"]
        direction TB
        p8["Docker Build"]
        p9["Security Scan"]
        p10["Push GHCR"]
        p11["Auth GCP"]
        p12["Load Secrets"]
        p8 --> p9
        p9 --> p10
        p10 --> p11
        p11 --> p12
    end

    subgraph Right["Verify & Production"]
        direction TB
        p13["Deploy Cloud Run"]
        p14["Health Check"]
        p15["Integration Tests"]
        p16["Smoke Tests"]
        p17["Live Service"]
        p18["Monitoring"]
        p13 --> p14
        p14 --> p15
        p15 --> p16
        p16 --> p17
        p17 --> p18
    end

    subgraph Rollback["Rollback"]
        direction TB
        p19["Failure Detection"]
        p20["Auto Rollback"]
        p19 --> p20
    end

    Left --> Middle
    Middle --> Right
    p7 --> p8
    p12 --> p13
    p14 -.->|Fail| p19
    p15 -.->|Fail| p19
    p16 -.->|Fail| p19
    p20 -.-> p18

    p1@{ shape: circle, label: "Developer" }
    p2@{ shape: stadium, label: "Local Testing<br/>docker-compose" }
    p3@{ shape: rect, label: "GitHub<br/>Main Branch" }
    p4@{ shape: hex, label: "Code Review" }
    p5@{ shape: rect, label: "Checkout Code" }
    p6@{ shape: rect, label: "Unit Tests<br/>go test ./..." }
    p7@{ shape: rect, label: "Coverage 80%+" }
    p8@{ shape: rect, label: "Docker Build<br/>Multi-stage" }
    p9@{ shape: hex, label: "Security Scan" }
    p10@{ shape: cyl, label: "Push GHCR" }
    p11@{ shape: trap-b, label: "Auth GCP" }
    p12@{ shape: docs, label: "Load Secrets" }
    p13@{ shape: rect, label: "Deploy Cloud Run" }
    p14@{ shape: diam, label: "Health Check" }
    p15@{ shape: diam, label: "Integration Tests" }
    p16@{ shape: diam, label: "Smoke Tests" }
    p17@{ shape: stadium, label: "Live Service<br/>api.yourdomain.com" }
    p18@{ shape: notch-rect, label: "Monitoring & Alerts" }
    p19@{ shape: hex, label: "Failure Detection" }
    p20@{ shape: lean-l, label: "Auto Rollback" }
```

## 3. Detailed CI/CD Pipeline Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant GA as GitHub Actions
    participant GHCR as GitHub Container Registry
    participant GCP as Google Cloud Platform
    participant CR as Cloud Run
    participant SQL as Cloud SQL
    participant SM as Secret Manager

    Dev->>GH: git push origin main
    GH->>GA: Trigger workflow

    Note over GA: Build Phase
    GA->>GA: Checkout code
    GA->>GA: Setup Go 1.24
    GA->>GA: Run go test ./...
    GA->>GA: Check coverage > 80%

    Note over GA: Container Phase
    GA->>GA: Build Docker image
    GA->>GA: Security scan
    GA->>GHCR: Push image (latest, sha)

    Note over GA,GCP: Deploy Phase
    GA->>GCP: Authenticate with SA key
    GA->>SM: Fetch JWT_SECRET_KEY
    GA->>SM: Fetch DATABASE_URL

    GA->>CR: Deploy new revision
    CR->>GHCR: Pull Docker image
    CR->>SQL: Establish connection
    CR->>CR: Start container

    Note over GA,CR: Testing Phase
    GA->>CR: Health check GET /api
    CR-->>GA: 200 OK
    GA->>CR: Test GET /docs
    CR-->>GA: 200 OK

    Note over GA,CR: Traffic Management
    GA->>CR: Update traffic 100% to new
    CR->>CR: Gradual rollout

    alt Deployment Success
        GA->>Dev: ✅ Deployment successful
        CR->>GCP: Send metrics
    else Deployment Failure
        GA->>CR: Rollback to previous
        CR->>CR: Route to old revision
        GA->>Dev: ❌ Deployment failed
    end
```

## 4. Data Flow Diagram

```mermaid
graph TD
    subgraph Client["Client Layer"]
        Browser["Web Browser"]
        Mobile["Mobile App"]
        API["API Client"]
    end

    subgraph EdgeLayer["Edge Layer"]
        DNS["Vercel DNS"]
        CDN["Cloud CDN"]
    end

    subgraph ApplicationLayer["Application Layer"]
        CloudRun["Cloud Run<br/>Go Application"]
        RateLimit["Rate Limiter<br/>60 req/min"]
        Auth["JWT Auth<br/>Middleware"]
        Router["Gin Router"]
    end

    subgraph BusinessLayer["Business Logic"]
        Handlers["HTTP Handlers"]
        Services["Services Layer"]
        Repositories["Repository Layer"]
    end

    subgraph DataLayer["Data Layer"]
        PostgreSQL["Cloud SQL<br/>PostgreSQL"]
        Search["Meilisearch<br/>Search Engine"]
        Cache["In-Memory Cache"]
    end

    subgraph SecurityLayer["Security"]
        Secrets["Secret Manager"]
        IAM["IAM & Service Accounts"]
        Encryption["Encryption at Rest"]
    end

    Browser --> DNS
    Mobile --> DNS
    API --> DNS
    DNS --> CDN
    CDN --> CloudRun

    CloudRun --> RateLimit
    RateLimit --> Auth
    Auth --> Router
    Router --> Handlers

    Handlers --> Services
    Services --> Repositories

    Repositories --> PostgreSQL
    Repositories --> Search
    Repositories --> Cache

    CloudRun --> Secrets
    PostgreSQL --> Encryption
    IAM -.-> CloudRun
    IAM -.-> PostgreSQL

    style Browser fill:#e1f5ff
    style CloudRun fill:#4285f4,color:#fff
    style PostgreSQL fill:#4285f4,color:#fff
    style Secrets fill:#fbbc04,color:#000
    style Auth fill:#ea4335,color:#fff
```

## 5. Deployment Infrastructure Map

```mermaid
graph TB
    subgraph Region["us-central1 Region"]
        subgraph Zone1["Zone A"]
            CR1["Cloud Run<br/>Instance 1"]
            SQL1["Cloud SQL<br/>Primary"]
        end

        subgraph Zone2["Zone B"]
            CR2["Cloud Run<br/>Instance 2"]
            SQL2["Cloud SQL<br/>Standby"]
        end

        subgraph Zone3["Zone C"]
            CR3["Cloud Run<br/>Instance 3"]
        end
    end

    subgraph GlobalResources["Global Resources"]
        LB["Global Load Balancer"]
        CDN["Cloud CDN"]
        DNS["Cloud DNS"]
    end

    subgraph Backup["Backup & DR"]
        AutoBackup["Automated Backups<br/>Daily"]
        PITR["Point-in-Time Recovery<br/>7 days"]
        MultiRegion["Multi-Region Replication<br/>Optional"]
    end

    DNS --> LB
    LB --> CDN
    CDN --> CR1
    CDN --> CR2
    CDN --> CR3

    CR1 --> SQL1
    CR2 --> SQL1
    CR3 --> SQL1

    SQL1 -.->|Replication| SQL2
    SQL1 --> AutoBackup
    SQL1 --> PITR
    AutoBackup -.-> MultiRegion

    style LB fill:#4285f4,color:#fff
    style SQL1 fill:#4285f4,color:#fff
    style SQL2 fill:#aecbfa
    style AutoBackup fill:#34a853,color:#fff
```

## 6. Security Architecture

```mermaid
graph LR
    subgraph PublicInternet["🌐 Public Internet"]
        User["Users"]
    end

    subgraph SecurityPerimeter["🔒 Security Perimeter"]
        CloudArmor["Cloud Armor<br/>DDoS Protection"]
        IAP["Identity-Aware Proxy<br/>Optional"]
        Firewall["Cloud Firewall<br/>Rules"]
    end

    subgraph ApplicationSecurity["🛡️ Application Security"]
        JWT["JWT Validation"]
        RBAC["Role-Based Access<br/>admin/billing/member"]
        RateLimit["Rate Limiting<br/>Per IP"]
        InputVal["Input Validation"]
    end

    subgraph DataSecurity["🔐 Data Security"]
        Encryption["Encryption at Rest<br/>AES-256"]
        TLS["TLS 1.3<br/>In Transit"]
        SecretMgr["Secret Manager<br/>Key Rotation"]
        Backup["Encrypted Backups"]
    end

    subgraph NetworkSecurity["🌐 Network Security"]
        PrivateIP["Private IP Only"]
        VPCPerim["VPC Perimeter"]
        ServiceMesh["Service Mesh<br/>Optional"]
    end

    subgraph Compliance["📋 Compliance"]
        Audit["Cloud Audit Logs"]
        AccessLogs["Access Logs"]
        Monitoring["Security Monitoring"]
    end

    User --> CloudArmor
    CloudArmor --> IAP
    IAP --> Firewall
    Firewall --> JWT

    JWT --> RBAC
    RBAC --> RateLimit
    RateLimit --> InputVal

    InputVal --> TLS
    TLS --> Encryption
    Encryption --> SecretMgr
    SecretMgr --> Backup

    Encryption --> PrivateIP
    PrivateIP --> VPCPerim
    VPCPerim --> ServiceMesh

    ServiceMesh --> Audit
    Audit --> AccessLogs
    AccessLogs --> Monitoring

    style CloudArmor fill:#ea4335,color:#fff
    style JWT fill:#fbbc04,color:#000
    style Encryption fill:#34a853,color:#fff
    style PrivateIP fill:#4285f4,color:#fff
```

---

## Diagram Descriptions

### 1. GCP Cloud Architecture
- **Purpose**: Shows the complete infrastructure layout on Google Cloud Platform
- **Key Components**: Cloud Run, Cloud SQL, VPC networking, Secret Manager
- **Highlights**: Private IP communication, multi-layer security, observability

### 2. CI/CD Pipeline
- **Purpose**: Illustrates the automated deployment flow from code to production
- **Key Stages**: Build, Test, Container, Deploy, Verify, Rollback
- **Highlights**: GitHub Actions automation, security scanning, health checks

### 3. Detailed Pipeline Flow
- **Purpose**: Sequence diagram showing interactions between components
- **Key Interactions**: GitHub → Actions → GCP → Cloud Run
- **Highlights**: Authentication flow, secret management, rollback strategy

### 4. Data Flow
- **Purpose**: Shows how data moves through the system layers
- **Key Layers**: Client → Edge → Application → Business → Data
- **Highlights**: Request routing, authentication, data access patterns

### 5. Deployment Infrastructure
- **Purpose**: Geographic distribution of resources
- **Key Aspects**: Multi-zone deployment, high availability, backup strategy
- **Highlights**: Auto-scaling, replication, disaster recovery

### 6. Security Architecture
- **Purpose**: Comprehensive security controls at each layer
- **Key Controls**: DDoS protection, JWT auth, encryption, audit logging
- **Highlights**: Defense in depth, compliance, monitoring

---

## Viewing Instructions

These diagrams use **Mermaid** syntax and can be viewed:

1. **GitHub**: Automatically renders in README.md and markdown files
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Online**: Paste code into https://mermaid.live/
4. **Documentation Sites**: Works with GitBook, Docusaurus, MkDocs

## Export Options

To export as images:

```bash
# Install mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# Convert to PNG
mmdc -i docs/ARCHITECTURE_DIAGRAMS.md -o architecture.png

# Convert to SVG
mmdc -i docs/ARCHITECTURE_DIAGRAMS.md -o architecture.svg
```

---

**Last Updated**: 2025-01-24
**Version**: 1.0.0
