import { SeedConcept, SeedQuestion } from './types.ts';

export const UNIT_1_CONCEPTS: SeedConcept[] = [
  {
    unit_number: 1,
    order_index: 1,
    topic_tag: 'Introduction of DBMS (Database Management System)',
    title: 'Introduction to DBMS',
    summary: 'Understand what data, a database, and a Database Management System (DBMS) are and how they organize information.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'A Database Management System (DBMS) is specialized software that lets users define, create, store, query, update, and secure structured data inside a centralized database.',
    example_text:
      'A university DBMS stores Students, Courses, and Enrollments in structured tables so thousands of students can register simultaneously without losing data.',
    diagram_type: 'three_schema',
    diagram_config: {
      layers: [
        { id: 'users', label: 'Users & Applications', role: 'Students, faculty, and mobile apps sending queries', sample: 'SELECT full_name, gpa FROM students;' },
        { id: 'dbms', label: 'DBMS Engine', role: 'Processes queries, checks rules & prevents conflicts', sample: 'Query Parser + Transaction Manager + Lock Manager' },
        { id: 'db', label: 'Database Storage', role: 'Organized collection of interrelated persistent data', sample: 'Tables: students, courses, enrollments' },
      ],
    },
    practical_sql: 'SELECT student_id, full_name, dept_id, gpa FROM students LIMIT 5;',
    practical_explanation: 'A DBMS lets you inspect structured student records instantaneously with a single query.',
    lesson_content: {
      simpleIntro: 'Imagine trying to manage 10,000 student grades across hundreds of scattered notebooks. A DBMS acts as an intelligent digital librarian that stores, organizes, and protects all that data in one place.',
      detailedExplanation: 'Raw facts (like "Rinki", "CS301", or "3.88") are Data. When organized meaningfully into interrelated tables, they form a Database. A Database Management System (DBMS) is the software layer—such as PostgreSQL, MySQL, Oracle, or SQLite—that sits between users and raw storage to handle queries, enforce rules, prevent corruption, and support concurrent users.',
      definitions: [
        { term: 'Data', meaning: 'Raw, unprocessed facts such as names, numbers, or timestamps.' },
        { term: 'Database', meaning: 'An organized collection of related data stored electronically.' },
        { term: 'DBMS', meaning: 'Software used to create, manage, query, and secure databases.' },
      ],
      realWorldExamples: [
        'Spotify uses a DBMS to link millions of tracks, playlists, and user listening histories.',
        'Hospital portals use a DBMS to share patient allergy and prescription records; clinical workflows also depend on timely synchronization and access controls.',
      ],
      practicalExamples: [
        {
          label: 'Inspecting Structured Student Data',
          snippet: 'SELECT student_id, full_name, gpa FROM students;',
          outcome: 'Retrieves clean rows managed by the DBMS engine.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Define Structure', detail: 'Declare tables, columns, and rules inside the DBMS.' },
        { step: '02', title: 'Store & Index', detail: 'Persist rows safely on disk with fast lookup paths.' },
        { step: '03', title: 'Query & Protect', detail: 'Serve accurate answers to multiple users at once.' },
      ],
      commonMistakes: [
        'Confusing the Database (the data itself) with the DBMS (the software managing it).',
        'Thinking spreadsheets like Excel are full DBMSs—spreadsheets lack multi-user concurrency control and strict relational integrity.',
      ],
      quickRecap: [
        'Data = raw facts; Database = organized data; DBMS = management software.',
        'Popular DBMS engines include PostgreSQL, MySQL, Oracle, SQL Server, and SQLite.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 2,
    topic_tag: 'History of DBMS',
    title: 'History of DBMS',
    summary: 'Trace the evolution from 1960s Hierarchical and Network models to Codd’s Relational Model and modern Cloud/NoSQL systems.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'DBMS technology includes 1960s navigational systems such as hierarchical IMS and network-model systems, followed by E. F. Codd’s 1970 relational model. SQL was developed later in the 1970s, followed by object-relational, NoSQL, and distributed cloud systems; these models have coexisted.',
    example_text:
      'Navigational systems often required applications to follow record paths. Codd’s relational model represented data with relations and later inspired declarative query languages such as SQL, which was developed after the 1970 paper.',
    diagram_type: 'schema_instance',
    diagram_config: {
      schemaColumns: ['Era', 'Model', 'Key Milestone'],
      instances: [
        ['1960s', 'Hierarchical & Network', 'IBM IMS & CODASYL pointer trees'],
        ['1970s', 'Relational Model & SQL development', 'Codd’s relational model; SQL was developed later in research and commercial systems'],
        ['1990s', 'Object-Relational', 'Complex types, multimedia & warehousing'],
        ['2000s+', 'NoSQL & NewSQL', 'Web-scale JSON documents & distributed SQL'],
      ],
    },
    practical_sql: 'SELECT dept_id, dept_name, building FROM departments;',
    practical_explanation: 'Relational queries describe the requested result without requiring application code to follow physical record pointers; earlier navigational systems continued in use.',
    lesson_content: {
      simpleIntro: 'Modern databases did not start with SQL tables. It took decades of breakthroughs—from NASA moon-mission trees to Edgar Codd’s mathematical revolution—to make querying effortless.',
      detailedExplanation: 'IBM developed IMS in the 1960s to support the Apollo space program; IMS is a hierarchical database management system and remains in use. Charles Bachman’s work on IDS was foundational to the Network Model. In 1970, E. F. Codd published the relational model using mathematical relations. SQL was developed later, notably in IBM’s System R research during the 1970s, and commercial relational systems followed. The timeline is an overview: hierarchical, network, relational, and non-relational systems have coexisted rather than simply replacing one another.',
      definitions: [
        { term: 'Hierarchical Model', meaning: '1960s tree-structured DBMS where each child has exactly one parent.' },
        { term: 'Network Model', meaning: 'Graph-based model allowing multiple parent records via physical pointers.' },
        { term: 'Relational Model', meaning: '1970 model by E.F. Codd representing all data as tables (relations).' },
      ],
      realWorldExamples: [
        'IBM developed IMS for NASA’s Apollo program to manage parts information for the Saturn launch vehicles.',
        'Modern fintech apps use relational SQL databases descended directly from Codd’s 1970 paper.',
      ],
      practicalExamples: [
        {
          label: 'Relational Table Lookup',
          snippet: 'SELECT dept_name, building FROM departments;',
          outcome: 'Declarative query—no pointer traversal code needed.',
        },
      ],
      visualSteps: [
        { step: '1960s', title: 'Navigational Era', detail: 'Trees & graphs requiring manual pointer walking.' },
        { step: '1970s', title: 'Relational model and SQL research', detail: 'Codd published the relational model in 1970; IBM developed SQL later in System R research.' },
        { step: '2010s+', title: 'Cloud & Hybrid Era', detail: 'Distributed SQL + specialized NoSQL stores.' },
      ],
      commonMistakes: [
        'Thinking NoSQL completely replaced Relational DBMS—RDBMS still powers most financial, enterprise, and transactional workloads.',
        'Forgetting that E.F. Codd invented the Relational Model in 1970.',
      ],
      quickRecap: [
        '1960s: Hierarchical (IMS) & Network (CODASYL).',
        '1970: E.F. Codd introduces Relational Databases.',
        '1970s onward: SQL research and relational systems developed alongside other database models.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 3,
    topic_tag: 'Advantages of Database Management System',
    title: 'Advantages of DBMS',
    summary: 'Explore how DBMS reduces redundancy, prevents inconsistency, enforces security, and supports concurrent backups.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'A DBMS can reduce uncontrolled redundancy, enforce declared integrity rules, provide access controls, coordinate concurrent work, and support recovery. These protections depend on correct schema, configuration, operations, and backup practices; a DBMS does not guarantee error-free data by itself.',
    example_text:
      'When a student updates their email once in the Students table, admissions, library, and exam portals all see the updated email instantly.',
    diagram_type: 'key_explorer',
    diagram_config: {
      tableName: 'DBMS Core Benefits',
      columns: [
        { name: 'Controlled Redundancy', keyType: 'Store each fact once, reference via keys', minimal: true, unique: true },
        { name: 'Data Integrity', keyType: 'Enforce CHECK, NOT NULL & FK rules automatically', minimal: true, unique: true },
        { name: 'Concurrency Control', keyType: 'Thousands of users read/write safely together', minimal: false, unique: true },
        { name: 'Backup & Recovery', keyType: 'Logs restore committed work after power loss', minimal: false, unique: true },
      ],
    },
    practical_sql: 'SELECT COUNT(*) AS total_students, ROUND(AVG(gpa), 2) AS avg_gpa FROM students;',
    practical_explanation: 'Centralized storage allows fast, accurate company-wide analytics and sharing.',
    lesson_content: {
      simpleIntro: 'Why do banks, hospitals, and universities use DBMS software instead of plain folders of files? A DBMS provides tools for organizing, protecting, and sharing data at scale when it is correctly designed and configured.',
      detailedExplanation: 'A DBMS can reduce duplicated data, enforce configured constraints, provide access controls, coordinate concurrent transactions, and support crash recovery. These are capabilities, not automatic guarantees that every database is correct or every failure harmless: the schema, transaction isolation, permissions, engine settings, and backup/recovery setup matter. Redundancy may still be deliberate, and transaction behavior varies by engine.',
      definitions: [
        { term: 'Data Consistency', meaning: 'Data remains coherent with database rules and transaction guarantees; replica freshness depends on the system’s consistency model.' },
        { term: 'Data Integrity', meaning: 'Accuracy and validity enforced by schema rules and constraints.' },
        { term: 'Concurrency Control', meaning: 'Coordinating concurrent transactions according to the database’s locking, isolation, and conflict-handling rules.' },
      ],
      realWorldExamples: [
        'Airline booking systems stop two passengers from reserving seat 14A at the exact same millisecond.',
        'University HR lets payroll view salaries while hiding them from student portals.',
      ],
      practicalExamples: [
        {
          label: 'Single-Source Analytics',
          snippet: 'SELECT COUNT(*) AS total_students, ROUND(AVG(gpa), 2) AS avg_gpa FROM students;',
          outcome: 'Computes live statistics directly from verified records.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Reduce duplication', detail: 'Store each fact once where practical and link related records with keys.' },
        { step: '02', title: 'Validate', detail: 'Reject invalid values before writing to disk.' },
        { step: '03', title: 'Protect', detail: 'Authenticate roles and log changes for recovery.' },
      ],
      commonMistakes: [
        'Assuming a DBMS eliminates 100% of redundancy—controlled redundancy (like Foreign Keys) is still used intentionally to link tables.',
      ],
      quickRecap: [
        'DBMS reduces redundancy, enforces integrity, enables concurrency, secures access, and automates recovery.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 4,
    topic_tag: 'Disadvantages of DBMS',
    title: 'Disadvantages of DBMS',
    summary: 'Evaluate DBMS trade-offs: hardware/licensing costs, complexity, DBA staffing, and single-point-of-failure risks.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'Despite its strengths, a DBMS introduces notable trade-offs: high software/hardware cost, setup and maintenance complexity, specialized Database Administrator (DBA) training needs, performance overhead for tiny apps, and higher impact if a centralized server fails.',
    example_text:
      'Running an enterprise Oracle cluster just to store a 10-line configuration file wastes memory, money, and setup time compared to a simple JSON/text file.',
    diagram_type: 'schema_instance',
    diagram_config: {
      schemaColumns: ['Trade-Off', 'Impact', 'When Files Might Win'],
      instances: [
        ['High Cost', 'Enterprise licenses, RAM & fast SSD servers', 'Small personal scripts'],
        ['Complexity', 'Schema design, tuning & backup planning', 'Static read-only configs'],
        ['Central Failure Risk', 'Server outage pauses all dependent apps', 'Offline single-file tools'],
      ],
    },
    practical_sql: 'SELECT dept_name, budget FROM departments ORDER BY budget DESC;',
    practical_explanation: 'Evaluating infrastructure budgets helps engineers decide when full DBMS engines are justified.',
    lesson_content: {
      simpleIntro: 'Every powerful tool comes with a price tag. Understanding DBMS disadvantages helps you choose the right storage tool instead of over-engineering simple projects.',
      detailedExplanation: 'Enterprise DBMS software requires dedicated RAM, CPU, and storage, plus commercial licensing fees for proprietary engines. Designing normalized schemas, tuning indexes, and managing backups demand skilled Database Administrators (DBAs). Because all apps share one centralized database, a single hardware crash or misconfigured migration can affect every department at once unless replication and failover are configured.',
      definitions: [
        { term: 'Overhead', meaning: 'Extra CPU, memory, and disk space consumed by query parsing, locking, and logging.' },
        { term: 'DBA (Database Administrator)', meaning: 'Specialist responsible for tuning, securing, and backing up a DBMS.' },
      ],
      realWorldExamples: [
        'A static portfolio website stores blog posts in Markdown files instead of paying for a 24/7 database server.',
        'When a primary database server goes down without failover, e-commerce checkout halts globally.',
      ],
      practicalExamples: [
        {
          label: 'Budget Awareness',
          snippet: 'SELECT dept_name, budget FROM departments ORDER BY budget DESC;',
          outcome: 'Tracks operational budgets where infrastructure costs matter.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Cost & Hardware', detail: 'Licenses + high-memory servers increase upfront cost.' },
        { step: '02', title: 'Operational Skill', detail: 'Requires DBA tuning, indexing & security audits.' },
        { step: '03', title: 'Failure Blast Radius', detail: 'Centralized outage impacts all connected services.' },
      ],
      commonMistakes: [
        'Believing DBMS is always better than flat files—for tiny embedded configs or temporary logs, plain files have far less overhead.',
      ],
      quickRecap: [
        'DBMS drawbacks: cost, complexity, hardware overhead, DBA requirement, and centralized failure risk.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 5,
    topic_tag: 'Application and Need for DBMS',
    title: 'Applications of DBMS',
    summary: 'Discover how Banking, Airlines, E-Commerce, Healthcare, Universities, and Telecom rely on DBMS daily.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'DBMS powers almost every modern digital domain—including Banking & Finance (transfers, ledgers), Airlines (real-time seat reservations), Universities (courses & transcripts), E-Commerce (inventory & orders), Healthcare (EHRs), and Telecommunications (call & billing logs).',
    example_text:
      'When you buy the last concert ticket online, the e-commerce DBMS locks that inventory row so nobody else can purchase the same ticket.',
    diagram_type: 'er_cardinality',
    diagram_config: {
      scenarios: [
        { id: 'bank', left: 'Customer', rel: 'Transfers', right: 'Account', ratio: 'Banking', note: 'ACID transactions protect account balances during transfers.' },
        { id: 'uni', left: 'Student', rel: 'Enrolls In', right: 'Course', ratio: 'Education', note: 'Tracks semesters, prerequisites, and final grades.' },
        { id: 'shop', left: 'Buyer', rel: 'Places', right: 'Order', ratio: 'E-Commerce', note: 'Updates inventory counts and payment statuses in real time.' },
      ],
    },
    practical_sql: 'SELECT c.course_code, c.title, i.full_name AS instructor FROM courses c JOIN instructors i ON c.instructor_id = i.instructor_id;',
    practical_explanation: 'A live university application joining Courses and Instructors.',
    lesson_content: {
      simpleIntro: 'Nearly every tap on your smartphone—checking a bank balance, ordering food, or viewing exam scores—triggers a DBMS query behind the scenes.',
      detailedExplanation: 'Different industries rely on DBMSs for different superpowers. Banks need strict atomic transactions so money never vanishes mid-transfer. Airlines need global concurrency control across thousands of travel agents. Universities manage multi-year transcripts and course catalogs. E-commerce platforms query product catalogs in milliseconds while tracking live warehouse stock.',
      definitions: [
        { term: 'OLTP (Online Transaction Processing)', meaning: 'High-speed daily transactions like ATM withdrawals and ticket bookings.' },
        { term: 'EHR (Electronic Health Record)', meaning: 'Clinical patient database linking diagnostics, lab tests, and prescriptions.' },
      ],
      realWorldExamples: [
        'Banking: ATMs & UPI transfers updating debit/credit ledgers safely.',
        'Airlines: Synchronized seat maps across global booking websites.',
        'Telecom: Logging billions of mobile data sessions for monthly billing.',
      ],
      practicalExamples: [
        {
          label: 'University Course Catalog App',
          snippet: 'SELECT course_code, title, credits FROM courses;',
          outcome: 'Powers student registration portals.',
        },
      ],
      visualSteps: [
        { step: 'Banking', title: 'Zero-Loss Ledgers', detail: 'Every debit matches a credit atomically.' },
        { step: 'E-Commerce', title: 'Live Inventory', detail: 'Orders decrement stock safely under load.' },
        { step: 'Education', title: 'Academic Records', detail: 'Links students, faculty, courses & grades.' },
      ],
      commonMistakes: [
        'Thinking DBMSs are only for tech companies—healthcare, manufacturing, retail, and government all depend on them.',
      ],
      quickRecap: [
        'Core DBMS domains: Banking, Airlines, Universities, E-Commerce, Healthcare, Telecom, and Social Media.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 6,
    topic_tag: 'Application and Need for DBMS',
    title: 'Need for DBMS',
    summary: 'Understand the concrete technical problems—scale, concurrency, crash safety, and ad-hoc querying—that make DBMS indispensable.',
    duration_minutes: 15,
    xp_reward: 50,
    gem_reward: 15,
    definition_text:
      'Organizations need a DBMS because manual file code breaks down when data grows beyond memory, when hundreds of users edit simultaneously, when queries change unexpectedly (ad-hoc queries), or when sudden crashes threaten partial writes.',
    example_text:
      'If a sudden report asks for "CS students with GPA > 3.7 who took CS301", a DBMS answers in 1 SQL line, whereas custom file scripts would require writing and compiling new search code.',
    diagram_type: 'three_schema',
    diagram_config: {
      layers: [
        { id: 'adhoc', label: 'Ad-Hoc Querying', role: 'Answer brand-new questions via SQL without rewriting C/Java file parsers', sample: 'SELECT * FROM students WHERE gpa > 3.7;' },
        { id: 'concurrency', label: 'Safe Multi-User Edits', role: 'Prevent lost updates when two clerks edit records simultaneously', sample: 'LOCK + ISOLATION LEVELS' },
        { id: 'durability', label: 'Crash Resilience', role: 'Never leave half-written data if power fails mid-operation', sample: 'Write-Ahead Log (WAL)' },
      ],
    },
    practical_sql: 'SELECT full_name, gpa FROM students WHERE gpa >= 3.8 ORDER BY gpa DESC;',
    practical_explanation: 'Declarative filtering answers brand-new business questions without custom file-parsing programs.',
    lesson_content: {
      simpleIntro: 'Writing a tiny program to read a text file works for 50 rows on one laptop. The moment 500 users need fast, crash-safe answers at the same time, you need a DBMS.',
      detailedExplanation: 'A DBMS supports persistent data beyond application memory, coordinates concurrent access, provides query languages, offers security controls, and implements transaction and recovery mechanisms. The guarantees depend on the selected engine, transaction settings, schema, permissions, and backup/recovery configuration; a DBMS cannot ensure every query is fast or every operation is recoverable under every failure.',
      definitions: [
        { term: 'Ad-hoc Query', meaning: 'An unscheduled, on-the-fly question posed to a database without writing new application code.' },
        { term: 'Lost Update', meaning: 'Concurrency bug where two simultaneous edits overwrite one another.' },
      ],
      realWorldExamples: [
        'A dean asks for the top 3 GPAs per department 5 minutes before a meeting—SQL answers immediately.',
        'If a payment server reboots mid-checkout, DBMS recovery rolls back incomplete charges.',
      ],
      practicalExamples: [
        {
          label: 'Instant Ad-Hoc Ranking',
          snippet: 'SELECT full_name, gpa FROM students WHERE gpa >= 3.8 ORDER BY gpa DESC;',
          outcome: 'Delivers sorted honors list in under a millisecond.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Scale Beyond RAM', detail: 'Page buffers & indexes handle huge datasets.' },
        { step: '02', title: 'Coordinate Users', detail: 'Locks stop simultaneous writers from clashing.' },
        { step: '03', title: 'Survive Crashes', detail: 'Logs undo half-finished writes on restart.' },
      ],
      commonMistakes: [
        'Assuming "saving to a JSON file" scales to multi-user web apps—concurrent writes to plain files easily corrupt data.',
      ],
      quickRecap: [
        'We need DBMS for scale, ad-hoc querying, concurrency safety, access control, and crash recovery.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 7,
    topic_tag: 'DBMS Architecture',
    title: 'Introduction to DBMS Architecture',
    summary: 'See how clients, query processors, storage engines, and tier levels fit together inside a DBMS.',
    duration_minutes: 15,
    xp_reward: 55,
    gem_reward: 15,
    definition_text:
      'DBMS deployment architecture describes where clients, application logic, and database services run. Common arrangements include 1-tier, 2-tier, and 3-tier deployments; this is distinct from the ANSI-SPARC three-schema abstraction.',
    example_text:
      'In a web app like DBMS Arena, your browser talks to an Express API server, which talks to the SQLite/SQL engine—a classic multi-level architecture.',
    diagram_type: 'three_schema',
    diagram_config: {
      layers: [
        { id: 'client', label: 'Presentation / Client Layer', role: 'UI, dashboards, and query forms', sample: 'Browser / Mobile App' },
        { id: 'app', label: 'Application / Query Layer', role: 'Business rules, authentication & query optimization', sample: 'API Server + Query Optimizer' },
        { id: 'data', label: 'Database Storage Layer', role: 'Tables, indexes, buffer manager & transaction logs', sample: 'SQL Engine + Disk Pages' },
      ],
    },
    practical_sql: "SELECT name FROM sqlite_master WHERE type='table';",
    practical_explanation: 'The DBMS catalog stores metadata describing every table managed inside the architecture.',
    lesson_content: {
      simpleIntro: 'Just like a building has a blueprint separating plumbing, electrical wiring, and living rooms, a DBMS uses layered architecture to separate user screens from raw disk storage.',
      detailedExplanation: 'This lesson compares two distinct models that both use three parts. Deployment tiers describe where software runs: client, application server, and database server. ANSI-SPARC schema levels describe database abstraction: External (user views), Conceptual (logical schema), and Internal (physical storage). They are related ideas about separation, but their layers do not map one-to-one. A middle application tier can centralize validation and access control; schema levels support data abstraction and independence.',
      definitions: [
        { term: 'DBMS Architecture', meaning: 'Structural blueprint governing how clients, business logic, and database storage communicate.' },
        { term: 'Query Processor', meaning: 'DBMS component that parses SQL, optimizes execution plans, and fetches rows.' },
      ],
      realWorldExamples: [
        'ATM -> Bank Middleware Server -> Core Banking Database.',
        'Browser -> Node.js Express Backend -> SQLite/PostgreSQL Engine.',
      ],
      practicalExamples: [
        {
          label: 'Inspecting System Catalog',
          snippet: "SELECT name FROM sqlite_master WHERE type='table';",
          outcome: 'Queries the internal metadata layer of the database architecture.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Deployment tiers', detail: 'Compare 1-tier, 2-tier, and 3-tier placements of clients, application logic, and database servers.' },
        { step: '02', title: 'ANSI-SPARC schemas', detail: 'External views sit above the Conceptual logical schema, which is mapped to Internal physical storage.' },
        { step: '03', title: 'Keep models distinct', detail: 'Deployment tiers describe software location; schema levels describe data abstraction.' },
      ],
      commonMistakes: [
        'Treating deployment tiers and ANSI-SPARC schema levels as the same model; one describes where components run and the other describes database abstraction.',
      ],
      quickRecap: [
        'Deployment tiers describe where application components run; ANSI-SPARC levels describe external views, the logical schema, and physical storage.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 8,
    topic_tag: '1-Level Architecture',
    title: '1-Level Architecture',
    summary: 'Examine single-tier architecture where user interface, DBMS engine, and disk files live on one machine.',
    duration_minutes: 15,
    xp_reward: 55,
    gem_reward: 15,
    definition_text:
      'In 1-Level (1-Tier) Architecture, the database engine, storage files, and user interface all reside on the exact same computer. Changes made by the user go directly to the local database without network hops.',
    example_text:
      'A developer running SQLite locally inside a desktop app or practicing SQL directly on a single workstation uses 1-Level Architecture.',
    diagram_type: 'three_schema',
    diagram_config: {
      layers: [
        { id: 'single', label: 'Single Machine (1-Tier)', role: 'UI + Business Logic + DBMS + Disk File all in one process', sample: 'Local App -> local_db.sqlite (Zero network latency)' },
      ],
    },
    practical_sql: 'SELECT project_id, project_name, budget FROM projects;',
    practical_explanation: 'Local embedded SQLite queries execute directly against local memory/disk with sub-millisecond latency.',
    lesson_content: {
      simpleIntro: 'Have you ever used a mobile app that works offline on an airplane? Its local database lives right inside your phone—that is 1-Level Architecture.',
      detailedExplanation: 'In 1-Level Architecture, there is no network separation between the user interface and the database server. Everything runs locally on a single machine. This makes setup effortless and latency nearly zero, which is ideal for local development, embedded devices, and single-user tools. However, it cannot easily share live data across hundreds of remote users simultaneously.',
      definitions: [
        { term: '1-Level (1-Tier) Architecture', meaning: 'All-in-one architecture where client UI and DBMS run directly on the same host machine.' },
        { term: 'Embedded Database', meaning: 'A lightweight DBMS library (like SQLite) compiled directly inside an application.' },
      ],
      realWorldExamples: [
        'Mobile apps storing offline notes or contacts in an embedded SQLite file.',
        'A student running a local MySQL workbench directly on their laptop for assignments.',
      ],
      practicalExamples: [
        {
          label: 'Local Embedded Query',
          snippet: 'SELECT project_id, project_name, budget FROM projects;',
          outcome: 'Runs locally in < 1 ms without network round-trips.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Local Request', detail: 'App calls DBMS library function directly.' },
        { step: '02', title: 'Direct Disk Read', detail: 'Engine reads local database file immediately.' },
      ],
      commonMistakes: [
        'Trying to scale a 1-tier local file app directly to thousands of concurrent internet users—multi-user web apps need 2-tier or 3-tier architectures.',
      ],
      quickRecap: [
        '1-Level Architecture = UI + DBMS + Storage on one machine; super fast and simple, best for local/offline apps.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 9,
    topic_tag: '2-Level Architecture',
    title: '2-Level Architecture',
    summary: 'Learn Client-Server 2-Tier architecture using JDBC/ODBC APIs between client workstations and a central DB server.',
    duration_minutes: 15,
    xp_reward: 55,
    gem_reward: 15,
    definition_text:
      'In 2-Level (2-Tier) Architecture, Client machines run the user interface and application logic while communicating directly over a network with a centralized Database Server using standard drivers like JDBC or ODBC.',
    example_text:
      'A desktop bank teller app in a branch sends SQL queries directly over an internal network to the branch’s central PostgreSQL server.',
    diagram_type: 'er_cardinality',
    diagram_config: {
      scenarios: [
        { id: 'c_s', left: 'Client App (Tier 1)', rel: 'JDBC / ODBC', right: 'DB Server (Tier 2)', ratio: '2-Tier', note: 'Multiple clients connect directly to one shared database server.' },
      ],
    },
    practical_sql: 'SELECT instructor_id, full_name, dept_id FROM instructors;',
    practical_explanation: 'In 2-Tier setups, client apps send SQL statements straight to the DB server and receive result tables.',
    lesson_content: {
      simpleIntro: 'Once a team needs multiple computers to share the same live data, we split the app into two parts: client workstations (Tier 1) and a central database server (Tier 2).',
      detailedExplanation: '2-Level Architecture follows the classic Client-Server model. Tier 1 (Client) presents the UI and formats requests; Tier 2 (Database Server) stores data and runs queries. Standard APIs like ODBC and JDBC bridge the client to the database server. While easy to build for small internal teams, exposing direct database connections to thousands of public internet users creates security and connection-limit bottlenecks.',
      definitions: [
        { term: '2-Level (2-Tier) Architecture', meaning: 'Client-server design where client apps connect directly to the DBMS server over a network.' },
        { term: 'JDBC / ODBC', meaning: 'Standard database connectivity drivers allowing apps to send SQL directly to a DBMS.' },
      ],
      realWorldExamples: [
        'A desktop pharmacy POS terminal querying a back-office SQL Server machine.',
        'An internal BI tool (like Tableau) connecting via ODBC to a company data warehouse.',
      ],
      practicalExamples: [
        {
          label: 'Direct Client-to-Server Query',
          snippet: 'SELECT instructor_id, full_name, dept_id FROM instructors;',
          outcome: 'Client receives rows directly over the network socket.',
        },
      ],
      visualSteps: [
        { step: 'Tier 1', title: 'Client Application', detail: 'Builds UI and sends SQL via JDBC/ODBC.' },
        { step: 'Tier 2', title: 'Database Server', detail: 'Authenticates, executes SQL, returns rows.' },
      ],
      commonMistakes: [
        'Exposing a 2-tier database port directly to public web browsers—browsers should always go through a 3rd Application Server tier.',
      ],
      quickRecap: [
        '2-Level = Client (UI) <-> Database Server via JDBC/ODBC; great for internal LAN apps, limited for huge public web scale.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 10,
    topic_tag: '3-Level Architecture',
    title: '3-Level Architecture',
    summary: 'Master both 3-Tier web architecture (Client -> App Server -> DB) and ANSI-SPARC 3-Schema abstraction (External, Conceptual, Internal).',
    duration_minutes: 15,
    xp_reward: 60,
    gem_reward: 20,
    definition_text:
      '3-Level Architecture covers two foundational concepts: (1) 3-Tier deployment (Client -> Application Server -> Database Server for web security and scale) and (2) the ANSI-SPARC 3-Schema Architecture separating External Level (views), Conceptual Level (logical tables), and Internal Level (physical disk blocks) to achieve Data Independence.',
    example_text:
      'DBMS Arena uses 3-Tier deployment (React Browser -> Express Server -> SQLite DB) AND 3-Schema abstraction (Student views vs conceptual tables vs B-tree disk pages).',
    diagram_type: 'three_schema',
    diagram_config: {
      layers: [
        { id: 'ext', label: 'External Level / Client Tier', role: 'User-specific views & web UI (hides private columns)', sample: 'VIEW PublicStudents AS SELECT full_name, dept_id FROM students;' },
        { id: 'con', label: 'Conceptual Level / App Tier', role: 'Logical database schema & business rules', sample: 'students(student_id PK, full_name, email, dept_id FK, gpa)' },
        { id: 'int', label: 'Internal Level / DB Storage Tier', role: 'Physical disk pages, B+ trees & compression', sample: 'Data blocks & index pages on SSD' },
      ],
    },
    practical_sql: 'SELECT student_id, full_name, year_level FROM students;',
    practical_explanation: 'Querying conceptual columns works seamlessly regardless of how the Internal physical storage is organized.',
    lesson_content: {
      simpleIntro: 'Why do modern apps put a middle layer between your browser and the database? And why can engineers reorganize disk storage without breaking existing SQL queries? The answer is 3-Level Architecture.',
      detailedExplanation: 'In 3-Tier deployment, the Client (browser) talks only to an Application Server (middle tier), which validates permissions and queries the Database Server—preventing direct DB exposure. Meanwhile, the ANSI-SPARC 3-Schema Architecture splits database design into three levels: External (customized user views), Conceptual (the entire logical schema of tables and constraints), and Internal (physical disk files and indexes). This separation delivers Physical Data Independence (changing storage does not break tables) and Logical Data Independence (changing tables does not break user views).',
      definitions: [
        { term: 'External Level', meaning: 'Top view layer tailored for specific user roles.' },
        { term: 'Conceptual Level', meaning: 'Middle logical layer describing all entities, types, and constraints.' },
        { term: 'Internal Level', meaning: 'Lowest physical layer describing disk blocks, pointers, and indexes.' },
        { term: 'Data Independence', meaning: 'Ability to modify a lower schema level without breaking higher levels.' },
      ],
      realWorldExamples: [
        'Every modern SaaS web app: Browser (Tier 1) -> Node/Python API (Tier 2) -> Postgres/SQLite (Tier 3).',
        'Adding an SSD index at the Internal Level speeds up queries without changing any Conceptual SQL.',
      ],
      practicalExamples: [
        {
          label: 'External Projection View',
          snippet: 'SELECT student_id, full_name, year_level FROM students;',
          outcome: 'Exposes only safe columns to the External layer.',
        },
      ],
      visualSteps: [
        { step: 'Level 1', title: 'External / Presentation', detail: 'User views & browser interface.' },
        { step: 'Level 2', title: 'Conceptual / Application', detail: 'Logical tables, constraints & API logic.' },
        { step: 'Level 3', title: 'Internal / Storage', detail: 'Physical disk files, indexes & logs.' },
      ],
      commonMistakes: [
        'Confusing Physical Data Independence (Internal changes do not affect Conceptual) with Logical Data Independence (Conceptual changes do not affect External views).',
      ],
      quickRecap: [
        '3-Level Architecture delivers security, scalability, and Physical/Logical Data Independence.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 11,
    topic_tag: 'Difference between File System and DBMS',
    title: 'Difference between File System and DBMS',
    summary: 'Compare traditional OS file systems against DBMS across redundancy, concurrency, security, and query power.',
    duration_minutes: 15,
    xp_reward: 60,
    gem_reward: 20,
    definition_text:
      'A File System (like CSV/text files in folders) relies on custom application code to parse bytes and struggles with redundancy, inconsistency, weak security, and concurrent edits. A DBMS centralizes data with declarative SQL queries, ACID safety, and automatic indexing.',
    example_text:
      'If Registrar and Hostel departments store separate student.csv files, changing a phone number in one leaves the other outdated. A DBMS stores it once.',
    diagram_type: 'schema_instance',
    diagram_config: {
      schemaColumns: ['Dimension', 'Traditional File System', 'DBMS'],
      instances: [
        ['Redundancy', 'High — duplicated across apps', 'Controlled — stored once & linked'],
        ['Querying', 'Write custom file-loop code', 'Declarative SQL in 1 line'],
        ['Concurrency', 'Risk of corrupted overwrites', 'ACID locks & isolation'],
        ['Crash Recovery', 'Manual / partial file corruption', 'Automatic WAL Rollback & Redo'],
      ],
    },
    practical_sql: 'SELECT s.full_name, d.dept_name FROM students s JOIN departments d ON s.dept_id = d.dept_id;',
    practical_explanation: 'DBMS links Students and Departments dynamically without duplicating department names in every student row.',
    lesson_content: {
      simpleIntro: 'Before databases existed, every program saved its own `.txt` or `.csv` files. Here is why that approach breaks down quickly compared to a DBMS.',
      detailedExplanation: 'In a traditional file-processing system, each department writes separate programs to read its own files. This causes data redundancy (wasted space), data inconsistency (mismatched copies), data isolation (hard to combine two files with different formats), integrity problems (hard to enforce rules across files), and atomicity failures if a crash occurs mid-write. A DBMS solves all five issues centrally.',
      definitions: [
        { term: 'Data Redundancy', meaning: 'Unnecessary duplication of the same data across multiple files.' },
        { term: 'Data Isolation', meaning: 'Difficulty combining data scattered across incompatible file formats.' },
      ],
      realWorldExamples: [
        'File System: Searching 50 CSVs manually with Python scripts whenever a manager asks a new question.',
        'DBMS: Running one SQL JOIN across normalized tables in 0.3 milliseconds.',
      ],
      practicalExamples: [
        {
          label: 'Zero-Redundancy Join',
          snippet: 'SELECT s.full_name, d.dept_name FROM students s JOIN departments d ON s.dept_id = d.dept_id;',
          outcome: 'Combines two entities cleanly without duplicating dept_name.',
        },
      ],
      visualSteps: [
        { step: 'File System', title: 'Scattered & Fragile', detail: 'Duplicate files, custom code, no locks.' },
        { step: 'DBMS', title: 'Unified & Safe', detail: 'Centralized schema, SQL queries, ACID locks.' },
      ],
      commonMistakes: [
        'Thinking a DBMS stores zero files on disk—under the hood a DBMS STILL uses OS files, but wraps them with indexing, locking, logging, and SQL.',
      ],
      quickRecap: [
        'DBMS beats File Systems on redundancy, consistency, querying, security, concurrency, and crash recovery.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 12,
    topic_tag: 'Entity Relationship Model',
    title: 'Entity Relationship (ER) Model',
    summary: 'Design high-level conceptual database blueprints using Peter Chen’s ER Model before writing any SQL.',
    duration_minutes: 15,
    xp_reward: 60,
    gem_reward: 20,
    definition_text:
      'Proposed by Peter Chen in 1976, the Entity Relationship (ER) Model is a high-level visual conceptual data model that represents real-world objects as Entities (rectangles), their properties as Attributes (ellipses), and associations between them as Relationships (diamonds).',
    example_text:
      'Before writing CREATE TABLE statements for a university, architects sketch Student, Course, and Instructor rectangles connected by Enrolls and Teaches diamonds.',
    diagram_type: 'er_cardinality',
    diagram_config: {
      scenarios: [
        { id: 'er_uni', left: 'Student [Entity]', rel: 'Enrolls In', right: 'Course [Entity]', ratio: 'M : N', note: 'Chen ER Notation: Rectangles = Entities, Diamonds = Relationships, Ellipses = Attributes.' },
        { id: 'er_teach', left: 'Instructor [Entity]', rel: 'Teaches', right: 'Course [Entity]', ratio: '1 : N', note: 'Visual blueprints align non-technical stakeholders and database engineers.' },
      ],
    },
    practical_sql: 'SELECT s.full_name, c.course_code, e.grade FROM enrollments e JOIN students s ON e.student_id = s.student_id JOIN courses c ON e.course_id = c.course_id LIMIT 5;',
    practical_explanation: 'Every ER diagram maps cleanly into relational SQL tables like Students, Courses, and Enrollments.',
    lesson_content: {
      simpleIntro: 'You would never pour concrete for a house without drawing a floor plan first. The Entity Relationship (ER) Model is the floor plan of database design.',
      detailedExplanation: 'Created by Peter Chen, an ER Diagram lets engineers and clients agree on what information a system must store before writing SQL. Three core building blocks appear in every ER diagram: Entities (nouns like Student or Course, drawn as rectangles), Attributes (properties like name or gpa, drawn as ellipses), and Relationships (verbs like Enrolls or Belongs To, drawn as diamonds).',
      definitions: [
        { term: 'ER Model', meaning: 'Conceptual blueprint modeling real-world objects (entities), properties (attributes), and links (relationships).' },
        { term: 'Chen Notation', meaning: 'Standard diagramming style using rectangles for entities, ellipses for attributes, and diamonds for relationships.' },
      ],
      realWorldExamples: [
        'Designing an e-commerce ER diagram with Customer, Order, Product, and Payment entities before building the backend.',
      ],
      practicalExamples: [
        {
          label: 'ER Relationship Realized in SQL',
          snippet: 'SELECT s.full_name, c.course_code, e.grade FROM enrollments e JOIN students s ON e.student_id = s.student_id JOIN courses c ON e.course_id = c.course_id;',
          outcome: 'Turns the Student-Enrolls-Course ER diagram into live queryable data.',
        },
      ],
      visualSteps: [
        { step: '01', title: 'Identify Entities', detail: 'Spot main nouns (Student, Course, Department).' },
        { step: '02', title: 'Attach Attributes', detail: 'List properties and underline the Primary Key.' },
        { step: '03', title: 'Connect Relationships', detail: 'Link entities with diamonds and cardinality.' },
      ],
      commonMistakes: [
        'Jumping straight into SQL tables without drawing an ER diagram—which leads to missing relationships and messy keys.',
      ],
      quickRecap: [
        'ER Model = Entities (Rectangles) + Attributes (Ellipses) + Relationships (Diamonds).',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 13,
    topic_tag: 'Entity Relationship Model',
    title: 'ER Entities & Attributes',
    summary: 'Distinguish Strong vs Weak entities and Simple, Composite, Multivalued, Derived, and Key attributes.',
    duration_minutes: 15,
    xp_reward: 60,
    gem_reward: 20,
    definition_text:
      'In the ER Model, a Strong Entity has its own unique Key Attribute, whereas a Weak Entity (double rectangle) depends on an owner entity. Attributes come in five flavors: Simple (atomic), Composite (sub-parts like First + Last name), Single-valued vs Multivalued (double ellipse, e.g., phone numbers), Derived (dashed ellipse, e.g., Age from DOB), and Key Attributes (underlined).',
    example_text:
      'In Student, student_id is a Key attribute, full_name is Composite (first + last), phone_numbers is Multivalued, and age is Derived from birth_date.',
    diagram_type: 'key_explorer',
    diagram_config: {
      tableName: 'ER Attribute Types (Student)',
      columns: [
        { name: 'student_id', keyType: 'Key Attribute (Underlined)', minimal: true, unique: true },
        { name: 'full_name', keyType: 'Composite Attribute (First + Last)', minimal: false, unique: false },
        { name: 'phone_numbers', keyType: 'Multivalued Attribute (Double Ellipse)', minimal: false, unique: false },
        { name: 'age (from DOB)', keyType: 'Derived Attribute (Dashed Ellipse)', minimal: false, unique: false },
      ],
    },
    practical_sql: 'SELECT student_id, full_name, email, year_level FROM students LIMIT 5;',
    practical_explanation: 'Key attributes like student_id guarantee every entity instance is uniquely identifiable.',
    lesson_content: {
      simpleIntro: 'Not all data fields behave the same way. Some uniquely identify a person, some split into smaller pieces, and others are calculated on the fly.',
      detailedExplanation: 'An Entity Set is a collection of similar entities (like all Students). Strong entities stand independently using their own Primary Key. Weak entities (such as an employee’s Dependent or an OrderLineItem) have no full key of their own and borrow their owner’s key. Attributes describe entities: Simple attributes cannot be split (gpa); Composite attributes break down (address -> street, city, zip); Multivalued attributes hold multiple values (skills); Derived attributes are computed from stored fields (age from DOB).',
      definitions: [
        { term: 'Strong Entity', meaning: 'Independent entity set possessing its own Primary Key.' },
        { term: 'Weak Entity', meaning: 'Dependent entity identified only when paired with an owner entity’s key.' },
        { term: 'Derived Attribute', meaning: 'Value calculated dynamically from another stored attribute (e.g., age).' },
      ],
      realWorldExamples: [
        'An InvoiceItem is a Weak Entity because "Line #1" only makes sense inside Invoice #402.',
      ],
      practicalExamples: [
        {
          label: 'Inspecting Key & Simple Attributes',
          snippet: 'SELECT student_id, full_name, email FROM students;',
          outcome: 'Uses key attribute student_id and atomic email.',
        },
      ],
      visualSteps: [
        { step: 'Key', title: 'Underlined Ellipse', detail: 'Uniquely identifies each entity instance.' },
        { step: 'Composite', title: 'Branching Ellipses', detail: 'Splits into sub-attributes.' },
        { step: 'Derived', title: 'Dashed Ellipse', detail: 'Computed at query time, not stored.' },
      ],
      commonMistakes: [
        'Storing derived attributes like Age directly as static numbers—they become wrong after every birthday!',
      ],
      quickRecap: [
        'Entities: Strong vs Weak. Attributes: Key, Simple, Composite, Multivalued, Derived.',
      ],
    },
  },
  {
    unit_number: 1,
    order_index: 14,
    topic_tag: 'Entity Relationship Model',
    title: 'ER Relationships & Cardinality',
    summary: 'Model 1:1, 1:N, and M:N cardinality ratios and Total vs Partial participation in ER diagrams.',
    duration_minutes: 15,
    xp_reward: 65,
    gem_reward: 20,
    definition_text:
      'Cardinality Ratio defines how many instances of Entity A can link to Entity B: One-to-One (1:1), One-to-Many (1:N), or Many-to-Many (M:N). Participation Constraints define whether involvement is mandatory (Total Participation, double line) or optional (Partial Participation, single line).',
    example_text:
      'Department to Student is 1:N (one department has many students; each student belongs to one department). Student to Course is M:N (many students take many courses).',
    diagram_type: 'er_cardinality',
    diagram_config: {
      scenarios: [
        { id: 'c1', left: 'Department', rel: 'Chaired By', right: 'Instructor', ratio: '1 : 1', note: 'Each department has 1 chair; an instructor chairs at most 1 department.' },
        { id: 'c2', left: 'Department', rel: 'Enrolls', right: 'Student', ratio: '1 : N', note: '1 department has many students; each student belongs to 1 department.' },
        { id: 'c3', left: 'Student', rel: 'Takes', right: 'Course', ratio: 'M : N', note: 'Students take multiple courses and courses hold multiple students.' },
      ],
    },
    practical_sql: 'SELECT d.dept_name, COUNT(s.student_id) AS student_count FROM departments d LEFT JOIN students s ON d.dept_id = s.dept_id GROUP BY d.dept_id;',
    practical_explanation: 'Counts the N-side Students linked to each 1-side Department.',
    lesson_content: {
      simpleIntro: 'Knowing the entities is half the story—you also have to specify the rules of connection: can a student have one advisor or many? Is a course required or optional?',
      detailedExplanation: 'Cardinality limits maximum links: 1:1 (e.g., Country <-> Capital), 1:N (Department <-> Students), and M:N (Students <-> Courses). Participation limits minimum links: Total Participation (minimum 1—drawn with a double line) means every entity must participate (every Course must belong to a Department); Partial Participation (minimum 0—single line) means participation is optional (an Instructor might not chair any department).',
      definitions: [
        { term: 'Cardinality Ratio', meaning: 'Maximum number of relationship instances (1:1, 1:N, M:N) an entity can join.' },
        { term: 'Total Participation', meaning: 'Mandatory rule where every entity instance must participate (double line).' },
        { term: 'Partial Participation', meaning: 'Optional participation where some entities may remain unlinked (single line).' },
      ],
      realWorldExamples: [
        '1:1: Passport <-> Citizen.',
        '1:N: Author <-> Books.',
        'M:N: Actors <-> Movies.',
      ],
      practicalExamples: [
        {
          label: 'Verifying 1:N Cardinality',
          snippet: 'SELECT d.dept_name, COUNT(s.student_id) AS student_count FROM departments d LEFT JOIN students s ON d.dept_id = s.dept_id GROUP BY d.dept_id;',
          outcome: 'Shows multiple students grouped under each department.',
        },
      ],
      visualSteps: [
        { step: '1:1', title: 'Exclusive Pair', detail: 'Max 1 link on both sides.' },
        { step: '1:N', title: 'Parent to Children', detail: '1 parent links to many children.' },
        { step: 'M:N', title: 'Mesh Association', detail: 'Many-to-many solved via a junction table.' },
      ],
      commonMistakes: [
        'Confusing Cardinality (maximum: 1 or N) with Participation (minimum: optional partial vs mandatory total).',
      ],
      quickRecap: [
        'Cardinality: 1:1, 1:N, M:N. Participation: Total (mandatory, double line) vs Partial (optional, single line).',
      ],
    },
  },
];

export const UNIT_1_QUESTIONS: SeedQuestion[] = [
  // C1: Introduction to DBMS
  {
    unit_number: 1,
    concept_order_index: 1,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Which statement accurately defines a DBMS?',
    payload: {
      options: [
        'Software that creates, manages, queries, and secures structured databases',
        'A raw text file stored on a USB flash drive',
        'A graphics card driver for rendering charts',
        'An HTML stylesheet for formatting web pages',
      ],
      correctIndex: 0,
    },
    explanation: 'A DBMS (Database Management System) is software that sits between users and stored data to manage queries, integrity, and security.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 1,
    is_unit_assessment: false,
    question_type: 'sql_challenge',
    prompt: 'Mini Challenge: Query the `students` table to list `student_id`, `full_name`, and `gpa` for up to 5 students.',
    payload: {
      starterSql: 'SELECT student_id, full_name, gpa\nFROM students\nLIMIT 5;',
      expectedMinRows: 3,
      requiredColumns: ['student_id', 'full_name', 'gpa'],
    },
    explanation: 'The DBMS returns structured rows cleanly via SELECT.',
    xp_value: 20,
  },

  // C2: History of DBMS
  {
    unit_number: 1,
    concept_order_index: 2,
    is_unit_assessment: false,
    question_type: 'drag_drop',
    prompt: 'Order the historical evolution of DBMS models from earliest (1960s) to newest:',
    payload: {
      mode: 'order',
      items: ['NoSQL & Cloud Distributed DBs', 'Relational Model (E.F. Codd, 1970)', 'Hierarchical & Network Models (1960s)'],
      correctOrder: ['Hierarchical & Network Models (1960s)', 'Relational Model (E.F. Codd, 1970)', 'NoSQL & Cloud Distributed DBs'],
    },
    explanation: '1960s Hierarchical/Network pointer models came first, followed by Codd’s 1970 Relational Model, then modern NoSQL/Cloud databases.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 2,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Who proposed the Relational Database Model in 1970?',
    payload: {
      options: ['Edgar F. Codd', 'Charles Babbage', 'Alan Turing', 'Tim Berners-Lee'],
      correctIndex: 0,
    },
    explanation: 'E.F. Codd published the landmark 1970 paper introducing the Relational Model.',
    xp_value: 15,
  },

  // C3: Advantages of DBMS
  {
    unit_number: 1,
    concept_order_index: 3,
    is_unit_assessment: false,
    question_type: 'matching',
    prompt: 'Match each DBMS advantage to its real benefit:',
    payload: {
      pairs: [
        { left: 'Controlled Redundancy', right: 'Store each entity once and link via keys' },
        { left: 'Concurrency Control', right: 'Coordinate simultaneous multi-user edits safely' },
        { left: 'Data Integrity', right: 'Enforce rules like NOT NULL and CHECK' },
      ],
    },
    explanation: 'A DBMS coordinates redundancy, multi-user concurrency, and data integrity centrally.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 3,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Check this statement on DBMS advantages:',
    payload: {
      statement: 'Many DBMSs provide role or privilege controls that can restrict access to sensitive data, such as salary columns.',
      correct: true,
    },
    explanation: 'True. Many DBMS products provide roles, privileges, or view-based access controls; the exact granularity and configuration vary by engine.',
    xp_value: 15,
  },

  // C4: Disadvantages of DBMS
  {
    unit_number: 1,
    concept_order_index: 4,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Which is a genuine disadvantage or trade-off of deploying a full enterprise DBMS?',
    payload: {
      options: [
        'Higher hardware, licensing, and DBA maintenance costs',
        'Inability to enforce Primary Keys',
        'Total lack of query languages',
        'Impossible to back up data',
      ],
      correctIndex: 0,
    },
    explanation: 'Enterprise DBMS engines incur hardware, licensing, complexity, and specialized DBA costs.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 4,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Evaluate this architecture trade-off:',
    payload: {
      statement: 'For a tiny 10-line static configuration file, a full enterprise DBMS server can add unnecessary overhead compared to a simple config file.',
      correct: true,
    },
    explanation: 'True! Tiny static config files do not justify the memory and setup overhead of a full DBMS server.',
    xp_value: 15,
  },

  // C5: Applications of DBMS
  {
    unit_number: 1,
    concept_order_index: 5,
    is_unit_assessment: false,
    question_type: 'matching',
    prompt: 'Match each industry application to what its DBMS manages:',
    payload: {
      pairs: [
        { left: 'Banking', right: 'Account ledgers and atomic fund transfers' },
        { left: 'Airlines', right: 'Real-time flight schedules and seat reservations' },
        { left: 'Universities', right: 'Student enrollments, transcripts, and courses' },
      ],
    },
    explanation: 'Banking, Airlines, and Universities all rely on DBMS engines for critical daily operations.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 5,
    is_unit_assessment: false,
    question_type: 'sql_challenge',
    prompt: 'Mini Challenge: Query the University `courses` table joined with `instructors` to display `course_code`, `title`, and instructor `full_name`.',
    payload: {
      starterSql:
        'SELECT c.course_code, c.title, i.full_name\nFROM courses c\nJOIN instructors i ON c.instructor_id = i.instructor_id;',
      expectedMinRows: 4,
      requiredColumns: ['course_code', 'title', 'full_name'],
    },
    explanation: 'Joining courses and instructors powers real university registration catalogs.',
    xp_value: 20,
  },

  // C6: Need for DBMS
  {
    unit_number: 1,
    concept_order_index: 6,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Why is a DBMS needed when managers ask unpredictable, one-time reporting questions?',
    payload: {
      options: [
        'It supports ad-hoc SQL queries without writing and compiling custom file-parsing programs',
        'It deletes old records automatically every hour',
        'It turns all tables into images',
        'It disables multi-user access',
      ],
      correctIndex: 0,
    },
    explanation: 'Ad-hoc querying via SQL is one of the strongest reasons organizations need a DBMS.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 6,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Evaluate this statement about concurrency:',
    payload: {
      statement: 'Without a DBMS locking mechanism, two users editing the same plain file simultaneously can cause lost updates and corrupted data.',
      correct: true,
    },
    explanation: 'True! Concurrent writes to raw files cause race conditions and corruption.',
    xp_value: 15,
  },

  // C7: DBMS Architecture
  {
    unit_number: 1,
    concept_order_index: 7,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'What is the main purpose of DBMS Architecture?',
    payload: {
      options: [
        'Organize how clients, query processors/application logic, and physical data storage interact',
        'Replace SQL with CSS styling',
        'Force every app to run without passwords',
        'Store all data in browser cookies only',
      ],
      correctIndex: 0,
    },
    explanation: 'DBMS architecture structures communication across user interfaces, logic/query processing, and database storage.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 7,
    is_unit_assessment: false,
    question_type: 'memory',
    prompt: 'Memory Match: Pair each DBMS architecture term with its role!',
    payload: {
      pairs: [
        { id: 'a1', term: '1-Level', definition: 'UI + DBMS + Disk on one machine' },
        { id: 'a2', term: '2-Level', definition: 'Client connects directly to DB Server' },
        { id: 'a3', term: '3-Level', definition: 'Client -> App Server -> DB Server' },
      ],
    },
    explanation: '1-Level, 2-Level, and 3-Level architectures scale from local apps to global web systems.',
    xp_value: 20,
  },

  // C8: 1-Level Architecture
  {
    unit_number: 1,
    concept_order_index: 8,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Evaluate this statement about 1-Level Architecture:',
    payload: {
      statement: 'In 1-Level Architecture, the user interface, application logic, and database files all run on the same single machine.',
      correct: true,
    },
    explanation: 'True! Local embedded tools like SQLite inside a single mobile/desktop app follow 1-Level Architecture.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 8,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Which scenario is the best fit for 1-Level Architecture?',
    payload: {
      options: [
        'An offline local notes app storing data directly on one device',
        'A global airline reservation platform with 10,000 concurrent agents',
        'A nationwide banking network across 500 branches',
        'A multiplayer cloud leaderboard',
      ],
      correctIndex: 0,
    },
    explanation: '1-Level architecture excels for local, single-user, offline-capable apps.',
    xp_value: 15,
  },

  // C9: 2-Level Architecture
  {
    unit_number: 1,
    concept_order_index: 9,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Which standard APIs are commonly used by clients in 2-Level Architecture to talk directly to a database server?',
    payload: {
      options: ['JDBC and ODBC', 'HTML and CSS', 'MP3 and PNG', 'SMTP and POP3'],
      correctIndex: 0,
    },
    explanation: 'JDBC (Java) and ODBC (Open Database Connectivity) bridge client applications directly to a database server in 2-Tier systems.',
    xp_value: 15,
  },
  {
    unit_number: 1,
    concept_order_index: 9,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Evaluate 2-Level Architecture:',
    payload: {
      statement: 'In 2-Level Architecture, a separate middle web-application server always sits between the client and the database server.',
      correct: false,
    },
    explanation: 'False! Having a middle application server makes it 3-Level (3-Tier) Architecture. In 2-Level, clients connect directly to the DB server.',
    xp_value: 15,
  },

  // C10: 3-Level Architecture
  {
    unit_number: 1,
    concept_order_index: 10,
    is_unit_assessment: false,
    question_type: 'drag_drop',
    prompt: 'Order the ANSI-SPARC 3-Schema Architecture from closest-to-user down to physical disk storage:',
    payload: {
      mode: 'order',
      items: ['Internal Level (Physical Storage)', 'External Level (User Views)', 'Conceptual Level (Logical Schema)'],
      correctOrder: ['External Level (User Views)', 'Conceptual Level (Logical Schema)', 'Internal Level (Physical Storage)'],
    },
    explanation: 'External Level sits at the top for users -> Conceptual Level in the middle -> Internal Level on disk.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 10,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'Changing how indexes are stored at the Internal Level without rewriting Conceptual SQL queries demonstrates:',
    payload: {
      options: ['Physical Data Independence', 'Data Redundancy', '1-Level Coupling', 'File Fragmentation'],
      correctIndex: 0,
    },
    explanation: 'Physical Data Independence shields logical queries from physical storage changes.',
    xp_value: 20,
  },

  // C11: Difference between File System and DBMS
  {
    unit_number: 1,
    concept_order_index: 11,
    is_unit_assessment: false,
    question_type: 'drag_drop',
    prompt: 'Sort each characteristic into "Traditional File System" vs "DBMS":',
    payload: {
      mode: 'categorize',
      items: ['High Data Redundancy', 'Declarative SQL Queries', 'ACID Crash Recovery', 'Custom File Parsing Loops'],
      categories: ['Traditional File System', 'DBMS'],
      correctBuckets: {
        'Traditional File System': ['High Data Redundancy', 'Custom File Parsing Loops'],
        DBMS: ['Declarative SQL Queries', 'ACID Crash Recovery'],
      },
    },
    explanation: 'File systems suffer from high redundancy and manual parsing; DBMS offers SQL and ACID recovery.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 11,
    is_unit_assessment: false,
    question_type: 'sql_challenge',
    prompt: 'Mini Challenge: Unlike flat files, a DBMS joins tables dynamically. Display `full_name` and `dept_name` by joining `students` and `departments`.',
    payload: {
      starterSql: 'SELECT s.full_name, d.dept_name\nFROM students s\nJOIN departments d ON s.dept_id = d.dept_id;',
      expectedMinRows: 5,
      requiredColumns: ['full_name', 'dept_name'],
    },
    explanation: 'Joining normalized tables prevents duplicating department names in every student record.',
    xp_value: 20,
  },

  // C12: Entity Relationship (ER) Model
  {
    unit_number: 1,
    concept_order_index: 12,
    is_unit_assessment: false,
    question_type: 'matching',
    prompt: 'Match each Chen ER Diagram symbol to what it represents:',
    payload: {
      pairs: [
        { left: 'Rectangle', right: 'Entity Set (e.g., Student)' },
        { left: 'Ellipse', right: 'Attribute (e.g., email)' },
        { left: 'Diamond', right: 'Relationship (e.g., Enrolls In)' },
      ],
    },
    explanation: 'Rectangles = Entities, Ellipses = Attributes, Diamonds = Relationships.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 12,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Evaluate this statement about the ER Model:',
    payload: {
      statement: 'The Entity Relationship Model is a high-level conceptual blueprint created before physical SQL tables are written.',
      correct: true,
    },
    explanation: 'True! ER modeling captures business entities and rules visually prior to SQL schema implementation.',
    xp_value: 15,
  },

  // C13: ER Entities & Attributes
  {
    unit_number: 1,
    concept_order_index: 13,
    is_unit_assessment: false,
    question_type: 'matching',
    prompt: 'Match each ER attribute type to its example:',
    payload: {
      pairs: [
        { left: 'Key Attribute', right: 'student_id (uniquely identifies row)' },
        { left: 'Composite Attribute', right: 'full_name (First + Last)' },
        { left: 'Derived Attribute', right: 'age (computed from birth_date)' },
        { left: 'Multivalued Attribute', right: 'phone_numbers (multiple numbers per person)' },
      ],
    },
    explanation: 'ER attributes distinguish keys, composite groups, multivalued lists, and derived calculations.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 13,
    is_unit_assessment: false,
    question_type: 'mcq',
    prompt: 'An entity that does NOT have its own full Primary Key and depends on an owner entity is called a:',
    payload: {
      options: ['Weak Entity', 'Strong Entity', 'Derived Entity', 'Super Entity'],
      correctIndex: 0,
    },
    explanation: 'Weak Entities rely on an identifying owner entity and are drawn with a double rectangle.',
    xp_value: 15,
  },

  // C14: ER Relationships & Cardinality
  {
    unit_number: 1,
    concept_order_index: 14,
    is_unit_assessment: false,
    question_type: 'matching',
    prompt: 'Match each ER Cardinality Ratio to the right relationship:',
    payload: {
      pairs: [
        { left: '1 : 1', right: 'One Department chaired by one Instructor' },
        { left: '1 : N', right: 'One Department has many Students' },
        { left: 'M : N', right: 'Many Students enroll in many Courses' },
      ],
    },
    explanation: '1:1, 1:N, and M:N describe maximum relationship cardinality.',
    xp_value: 20,
  },
  {
    unit_number: 1,
    concept_order_index: 14,
    is_unit_assessment: false,
    question_type: 'true_false',
    prompt: 'Check this ER Participation rule:',
    payload: {
      statement: 'Total Participation (double line) requires EVERY entity in the set to participate in at least one relationship instance.',
      correct: true,
    },
    explanation: 'True! Total Participation is mandatory (min 1), whereas Partial Participation is optional (min 0).',
    xp_value: 15,
  },

  // UNIT I BOSS ASSESSMENT
  {
    unit_number: 1,
    concept_order_index: null,
    is_unit_assessment: true,
    question_type: 'mcq',
    prompt: '[Unit I Assessment] Which 1970 proposal introduced a table-based relational model as an alternative to navigational pointer models?',
    payload: {
      options: ['E.F. Codd’s Relational Model', '1-Level Flat Files', 'Assembly Tape Storage', 'Manual CSV Merging'],
      correctIndex: 0,
    },
    explanation: 'E. F. Codd published the relational model in 1970. It offered a table-based alternative to hierarchical and network pointer models; those earlier systems, including IBM IMS, continued to be used.',
    xp_value: 25,
  },
  {
    unit_number: 1,
    concept_order_index: null,
    is_unit_assessment: true,
    question_type: 'matching',
    prompt: '[Unit I Assessment] Match each architecture model to its description:',
    payload: {
      pairs: [
        { left: '1-Tier Architecture', right: 'UI + application logic + database on one device' },
        { left: '2-Tier Architecture', right: 'Client talks directly to the database server' },
        { left: 'ANSI-SPARC 3-Schema Architecture', right: 'External, Conceptual & Internal schema separation' },
      ],
    },
    explanation: 'Tier architecture describes where application components run; ANSI-SPARC schema architecture separates user views, the logical schema, and physical storage.',
    xp_value: 30,
  },
  {
    unit_number: 1,
    concept_order_index: null,
    is_unit_assessment: true,
    question_type: 'drag_drop',
    prompt: '[Unit I Assessment] Categorize these items into "DBMS Advantage" vs "DBMS Disadvantage":',
    payload: {
      mode: 'categorize',
      items: ['Controlled Redundancy', 'High Software/Hardware Cost', 'Automated Crash Recovery', 'DBA Maintenance Complexity'],
      categories: ['DBMS Advantage', 'DBMS Disadvantage'],
      correctBuckets: {
        'DBMS Advantage': ['Controlled Redundancy', 'Automated Crash Recovery'],
        'DBMS Disadvantage': ['High Software/Hardware Cost', 'DBA Maintenance Complexity'],
      },
    },
    explanation: 'DBMS brings consistency and crash safety at the expense of cost and complexity.',
    xp_value: 30,
  },
  {
    unit_number: 1,
    concept_order_index: null,
    is_unit_assessment: true,
    question_type: 'true_false',
    prompt: '[Unit I Assessment] Verify ER Modeling fundamentals:',
    payload: {
      statement: 'In an ER diagram, a Derived Attribute like Age is computed from another attribute (birth_date) and is drawn with a dashed ellipse.',
      correct: true,
    },
    explanation: 'True! Derived attributes use dashed ellipses in Chen ER notation.',
    xp_value: 25,
  },
  {
    unit_number: 1,
    concept_order_index: null,
    is_unit_assessment: true,
    question_type: 'sql_challenge',
    prompt: '[Unit I Assessment] Query the ER-mapped database to list `dept_name` and how many `students` belong to each department (`student_count`).',
    payload: {
      starterSql:
        'SELECT d.dept_name, COUNT(s.student_id) AS student_count\nFROM departments d\nLEFT JOIN students s ON d.dept_id = s.dept_id\nGROUP BY d.dept_id;',
      expectedMinRows: 3,
      requiredColumns: ['dept_name', 'student_count'],
    },
    explanation: 'This query verifies the 1:N relationship between Departments and Students.',
    xp_value: 40,
  },
];
