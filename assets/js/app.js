(function () {
  var timelineData = [
    {
      step: "Artifact 1",
      title: "feature_analysis_prompt.xml",
      text: "Prompt prepared to analyse requirements and guide AI output structure."
    },
    {
      step: "Artifact 2",
      title: "feature_analysis.md",
      text: "AI-generated analysis describes architecture, data flow, and business rationale."
    },
    {
      step: "Artifact 3",
      title: "implementation_plans_prompt.xml",
      text: "Prompt defines implementation planning format and delivery sequencing."
    },
    {
      step: "Artifact 4",
      title: "service_api_implementation_plan.md",
      text: "Detailed service/API plan translates analysis into actionable engineering work."
    },
    {
      step: "Artifact 5",
      title: "user_stories_prompt.xml",
      text: "Prompt aligns story generation to analysis and plan decisions."
    },
    {
      step: "Artifact 6",
      title: "user_stories.md",
      text: "Execution-ready stories and tasks prepared for Azure DevOps automation."
    },
    {
      step: "Artifact 7",
      title: "PowerShell script",
      text: "Execution-ready test plans prepared for Azure DevOps automation."
    }
  ];

  var docsData = [
    {
      kind: "Prompt XML",
      title: "feature_analysis_prompt.xml",
      source: "ItemRanking/feature_analysis_prompt.xml",
      highlights: [
        {
          label: "Role",
          text: "Experienced product manager generating questions and recommendations that serve as the foundation for comprehensive user story creation."
        },
        {
          label: "Description",
          text: "Integrate Last7DaysSalesValue from the Item Ranking file into the Delivery system so it drives accurate Hot/Cold value calculations for tub and set items."
        },
        {
          label: "Details",
          rowSpan: 2,
          items: [
            "Item Ranking file structure: 7 columns — Item Number, Last7DaysSaleUnit/Value, FutureSeasonEnd Unit/Value, NextSeasonEnd Unit/Value.",
            "Data integration: files moved from dataintstinsdeveuw to tp-partner storage account (container: deliveryitemranking).",
            "New service DeliveryItemRankingService.cs in Delivery.Processor.API — reads blob, maps data, saves to database.",
            "New table delivery.ItemRanking (ItemNumber, Last7DaysSalesValue, BlobName) with batch insert stored procedure."
          ]
        },
        {
          label: "Requirements",
          items: [
            "Collect store code, item number, and Last7DaysSales from the Item Ranking file on a scheduled basis.",
            "Retain Last7DaysSales data for all items present in a GI/GID file at load time."
          ]
        },
        {
          label: "Questions",
          text: "AI generates 5 iterative questions and recommendations until a summary is requested. Final output is feature_analysis.md capturing the full proposed solution."
        }
      ]
    },
    {
      kind: "Analysis Markdown",
      title: "feature_analysis.md",
      source: "ItemRanking/feature_analysis.md",
      highlights: [
        {
          label: "Business Context",
          text: "Replaces mock item-level ranking data with live Last7DaysSalesValue from the Item Ranking file to enable accurate Hot/Cold delivery calculations."
        },
        {
          label: "Architecture Flow",
          text: "Item Ranking files are transferred from the ingest storage account to the tp-partner storage account, then imported into the delivery database before delivery file processing begins."
        },
        {
          label: "Database Design",
          items: [
            "Table delivery.ItemRanking (ItemNumber, Last7DaysSalesValue, BlobName).",
            "Stored procedure delivery.InsertOrUpdateItemRanking — idempotent batch upsert keyed on BlobName.",
            "Stored procedure to retrieve Last7DaysSalesValue for all item numbers used in Hot/Cold calculations."
          ]
        },
        {
          label: "Implementation Direction",
          items: [
            "New DeliveryItemRankingService.cs with blob-read, column mapping, and repository persistence logic.",
            "Separate IDeliveryItemRankingRepository for all database access.",
            "Hot/Cold calculation method updated to source Last7DaysSalesValue from repository instead of mock data."
          ]
        }
      ]
    },
    {
      kind: "Prompt XML",
      title: "implementation_plans_prompt.xml",
      source: "ItemRanking/implementation_plans_prompt.xml",
      highlights: [
        {
          label: "Role",
          text: "Skilled SQL Expert and experienced API architect tasked with producing a complete database and API implementation plan based on feature_analysis.md and user_stories.md."
        },
        {
          label: "Tasks",
          items: [
            "Database Implementation Plan: table schema, relationships, constraints, and stored procedures.",
            "Service and API Implementation Plan: API endpoints (methods, parameters, responses) and service architecture.",
            "Output two documents: database_implementation_plan.md and service_api_implementation_plan.md."
          ]
        },
        {
          label: "Details",
          items: [
            "Out of scope: migrations, backup/recovery, security considerations, performance optimisation, data integrity, compliance, and deployment.",
            "Plans must be clear, detailed, and aligned with best practices for database and API design.",
            "Output saved to the ./ai/ItemRanking folder."
          ]
        }
      ]
    },
    {
      kind: "Plan Markdown",
      title: "service_api_implementation_plan.md",
      source: "ItemRanking/service_api_implementation_plan.md",
      highlights: [
        {
          label: "Database Plan",
          items: [
            "Table delivery.ItemRanking with columns: ItemNumber, Last7DaysSalesValue, BlobName.",
            "Stored procedure delivery.InsertOrUpdateItemRanking — batch upsert with BlobName-based idempotency.",
            "Stored procedure to retrieve all item rankings for downstream Hot/Cold calculation."
          ]
        },
        {
          label: "Service Architecture",
          items: [
            "DeliveryItemRankingService.cs in Delivery.Processor.API — reads blob, maps columns, triggers repository save.",
            "Separate IDeliveryItemRankingRepository interface for database access.",
            "Service invoked before the main DeliveryFileImport function to ensure ranking data is available."
          ]
        },
        {
          label: "Orchestration",
          items: [
            "Import order: Item Ranking blob import → delivery file processing → Hot/Cold calculation.",
            "BlobName-based idempotency prevents duplicate imports on reprocessing runs."
          ]
        }
      ]
    },
    {
      kind: "Prompt XML",
      title: "user_stories_prompt.xml",
      source: "ItemRanking/user_stories_prompt.xml",
      highlights: [
        {
          label: "Role",
          text: "Experienced AI assistant generating user stories based solely on feature_analysis.md — developed collaboratively with Development, QA, DevOps, and Architecture teams."
        },
        {
          label: "Information",
          items: [
            "feature_analysis.md is the sole source of truth — no external assumptions permitted.",
            "Stories must be clear, testable, actionable, and aligned with overall project goals.",
            "Development area must include full technical implementation details."
          ]
        },
        {
          label: "Template",
          items: [
            "Title: brief descriptive title.",
            "Description: overall description of the user story.",
            "Development tasks: bullet-point list of technical implementation tasks.",
            "Testing scenarios: bullet-point list of validation scenarios.",
            "Acceptance criteria: As a [user], I want [action] so that [benefit]."
          ]
        },
        {
          label: "Output",
          items: [
            "Generate a proposal user story first, then produce the final version.",
            "One user story per feature analysis document, broken into associated tasks per section 13.",
            "Final output saved as user_stories.md in the ./ai/itemranking folder."
          ]
        }
      ]
    },
    {
      kind: "Stories Markdown",
      title: "user_stories.md",
      source: "ItemRanking/user_stories.md",
      highlights: [
        {
          label: "Coverage",
          items: [
            "Database tasks: table creation and stored procedures for insert/update and retrieval.",
            "Integration tasks: blob transfer from ingest to tp-partner storage account.",
            "Service tasks: DeliveryItemRankingService.cs implementation and repository layer.",
            "Delivery processing: Hot/Cold calculation updated to consume live ranking data.",
            "Test tasks: unit and integration tests for all new components."
          ]
        },
        {
          label: "Azure DevOps Readiness",
          text: "Stories are structured for direct import into Azure DevOps as work items, with acceptance criteria and development tasks formatted for backlog consumption."
        }
      ]
    }
  ];

  var timelineDocMap = [0, 1, 2, 3, 4, 5, null];

  var tasksData = [
    { id: "4840164", title: "Database Schema Implementation", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 4 },
    { id: "4840166", title: "Data Integration Platform Configuration", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840167", title: "Model Classes Implementation", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840181", title: "Repository Extension", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840182", title: "DeliveryItemRankingService Implementation", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 6 },
    { id: "4840183", title: "Configuration Updates - infra", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4840184", title: "DeliveryFileImportFunction Integration", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840186", title: "HotColdRefreshService Modification", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840187", title: "Dependency Injection Registration", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4840188", title: "Application Insights Instrumentation", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4840189", title: "Unit Tests (DeliveryItemRankingServiceTests.cs)", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 5 },
    { id: "4840191", title: "Repository Tests (DeliveryDalRepositoryTests.cs)", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 2 },
    { id: "4840193", title: "HotColdRefreshService Tests (HotColdRefreshServiceTests.cs)", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4840480", title: "Preparing implementation plan for database and processor api", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 7 },
    { id: "4840691", title: "Generating test cases using AI", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 4 },
    { id: "4840696", title: "Testing in Dev", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4846307", title: "Database modification - removing StoreCode", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4846309", title: "Adjust md document to remove store code relation", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4895279", title: "[BUG] Insufficient error checking when processing the deliveryitemranking csv file", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 3 },
    { id: "4896330", title: "[BUG] HotColdValue calculation not done if GID and deliveryitemranking files loaded in the same time slot", state: "Closed", aiUsed: false, aiType: null, aiSavings: null },
    { id: "4898786", title: "[BUG] Delivery Item Ranking file processing error when multiple lines with the same ItemNumber present", state: "Closed", aiUsed: true, aiType: "GITHub CoPilot", aiSavings: 1 },
    { id: "4899899", title: "[BUG] HotColdValue calculation uses rounded-off Last7DaysSalesValue numbers", state: "Closed", aiUsed: false, aiType: null, aiSavings: null }
  ];

  var testCasesData = [
    { id: "4861218", title: "Verify Database Schema Creation with Correct Structure", state: "Design" },
    { id: "4861219", title: "Verify Stored Procedures Creation and Functionality", state: "Design" },
    { id: "4861220", title: "Verify Data Integration Platform File Map Configuration", state: "Design" },
    { id: "4861221", title: "Verify ItemRankingModel Class Structure", state: "Design" },
    { id: "4861222", title: "Verify Item Ranking File Transfer to TP-Partner Storage", state: "Design" },
    { id: "4861223", title: "Verify GetBlobInformation API Integration", state: "Design" },
    { id: "4861224", title: "Verify CSV Parsing Extracts Correct Data Fields", state: "Design" },
    { id: "4861225", title: "Verify Batch Insert of 10,000 Records Per Batch", state: "Design" },
    { id: "4861226", title: "Verify Processed Blobs Moved to Success Container", state: "Design" },
    { id: "4861227", title: "Verify Failed Processing Moves Blobs to Failed Container", state: "Design" },
    { id: "4861228", title: "Verify DeliveryFileImportFunction Execution Sequence", state: "Design" },
    { id: "4861229", title: "Verify Item Ranking Import Errors Do Not Block GI/GID Processing", state: "Design" },
    { id: "4861230", title: "Verify HotColdRefreshService Uses Database Instead of Mock", state: "Design" },
    { id: "4861231", title: "Verify HotColdValue Calculation with Real Database Data", state: "Design" },
    { id: "4861232", title: "Verify Warning Logged When No Item Ranking Data Found", state: "Design" },
    { id: "4861233", title: "Verify Duplicate Blob GUID Updates Existing Records", state: "Design" },
    { id: "4861234", title: "Verify Configuration Settings Are Correctly Defined", state: "Design" },
    { id: "4861235", title: "Verify Dependency Injection Registration", state: "Design" },
    { id: "4861236", title: "Verify Application Insights Custom Events Are Logged", state: "Design" },
    { id: "4861237", title: "Verify Transaction Rollback on Database Error", state: "Design" }
  ];

  var dbChangesData = [
    { file: "database_implementation_plan.md", stat: "+156", path: "/Delivery/.ai/item_ranking/database_implementation_plan.md" },
    { file: "delivery.GetItemRankingByStoreCode.sql", stat: "+13", path: "/Delivery/Delivery/delivery/StoredProcedures/delivery.GetItemRankingByStoreCode.sql" },
    { file: "delivery.InsertOrUpdateItemRanking.sql", stat: "+42", path: "/Delivery/Delivery/delivery/StoredProcedures/delivery.InsertOrUpdateItemRanking.sql" },
    { file: "delivery.StoreItemRanking.sql", stat: "+20", path: "/Delivery/Delivery/delivery/Tables/delivery.StoreItemRanking.sql" },
    { file: "delivery.ItemRankingType.sql", stat: "+7", path: "/Delivery/Delivery/delivery/Types/delivery.ItemRankingType.sql" }
  ];

  var apiChangesData = [
    { file: "feature_analysis_prompt.xml", stat: "+81", path: "/Delivery.Processor.API/.ai/ItemRanking/feature_analysis_prompt.xml" },
    { file: "feature_analysis.md", stat: "+1072", path: "/Delivery.Processor.API/.ai/ItemRanking/feature_analysis.md" },
    { file: "implementation_plans_prompt.xml", stat: "+25", path: "/Delivery.Processor.API/.ai/ItemRanking/implementation_plans_prompt.xml" },
    { file: "service_api_implementation_plan.md", stat: "+915", path: "/Delivery.Processor.API/.ai/ItemRanking/service_api_implementation_plan.md" },
    { file: "user_stories_prompt.xml", stat: "+43", path: "/Delivery.Processor.API/.ai/ItemRanking/user_stories_prompt.xml" },
    { file: "user_stories.md", stat: "+243", path: "/Delivery.Processor.API/.ai/ItemRanking/user_stories.md" },
    { file: "DeliveryFileImportFunction.cs", stat: "-7+52", path: "/Delivery.Processor.API/Delivery.Processor.API/Functions/DeliveryFileImportFunction.cs" },
    { file: "Constants.Configuration.cs", stat: "-2+12", path: "/Delivery.Processor.API/Delivery.Processor.API/Helpers/Constants.Configuration.cs" },
    { file: "Constants.ItemRanking.cs", stat: "+26", path: "/Delivery.Processor.API/Delivery.Processor.API/Helpers/Constants.ItemRanking.cs" },
    { file: "CustomEvents.cs", stat: "+11", path: "/Delivery.Processor.API/Delivery.Processor.API/Helpers/CustomEvents.cs" },
    { file: "IDeliveryItemRankingService.cs", stat: "+10", path: "/Delivery.Processor.API/Delivery.Processor.API/Interfaces/IDeliveryItemRankingService.cs" },
    { file: "IItemRankingRepository.cs", stat: "+28", path: "/Delivery.Processor.API/Delivery.Processor.API/Interfaces/IItemRankingRepository.cs" },
    { file: "ItemRankingModel.cs", stat: "+27", path: "/Delivery.Processor.API/Delivery.Processor.API/Models/ItemRankingModel.cs" },
    { file: "BaseDeliveryFileProcessor.cs", stat: "-6+36", path: "/Delivery.Processor.API/Delivery.Processor.API/Processor/BaseDeliveryFileProcessor.cs" },
    { file: "BlobDataProcessor.cs", stat: "-8+8", path: "/Delivery.Processor.API/Delivery.Processor.API/Processor/BlobDataProcessor.cs" },
    { file: "DeliveryStoreDataProcessor.cs", stat: "-2+11", path: "/Delivery.Processor.API/Delivery.Processor.API/Processor/DeliveryStoreDataProcessor.cs" },
    { file: "ItemRankingRepository.cs", stat: "+85", path: "/Delivery.Processor.API/Delivery.Processor.API/Repositories/ItemRankingRepository.cs" },
    { file: "CombinedRefreshService.cs", stat: "-3+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/CombinedRefreshService.cs" },
    { file: "ConfigurationServiceRefreshService.cs", stat: "-2+14", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/ConfigurationServiceRefreshService.cs" },
    { file: "DeliveryItemRankingService.cs", stat: "+358", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/DeliveryItemRankingService.cs" },
    { file: "DeliveryRefreshService.cs", stat: "+2", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/DeliveryRefreshService.cs" },
    { file: "DepartmentNameRefreshService.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/DepartmentNameRefreshService.cs" },
    { file: "HotColdRefreshService.cs", stat: "-28+47", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/HotColdRefreshService.cs" },
    { file: "ItemServiceRefreshService.cs", stat: "+6", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/ItemServiceRefreshService.cs" },
    { file: "MarkdownRefreshService.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/MarkdownRefreshService.cs" },
    { file: "PriceChangeRefreshService.cs", stat: "+2", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/PriceChangeRefreshService.cs" },
    { file: "ProductivityRefreshService.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/ProductivityRefreshService.cs" },
    { file: "ReplenishmentRefreshService.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/ReplenishmentRefreshService.cs" },
    { file: "RosaRefreshService.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/Services/RosaRefreshService.cs" },
    { file: "local.settings.example.json", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API/local.settings.example.json" },
    { file: "Program.cs", stat: "+4", path: "/Delivery.Processor.API/Delivery.Processor.API/Program.cs" },
    { file: "BlobDataProcessorTests.cs", stat: "-2+2", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Processor/BlobDataProcessorTests.cs" },
    { file: "GiFileProcessorTests.cs", stat: "-9+8", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Processor/GiFileProcessorTests.cs" },
    { file: "ItemRankingRepositoryTests.cs", stat: "+444", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Repositories/ItemRankingRepositoryTests.cs" },
    { file: "ConfigurationServiceRefreshServiceTests.cs", stat: "+1", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Services/ConfigurationServiceRefreshServiceTests.cs" },
    { file: "DeliveryItemRankingServiceTests.cs", stat: "+723", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Services/DeliveryItemRankingServiceTests.cs" },
    { file: "HotColdRefreshServiceTests.cs", stat: "-45+112", path: "/Delivery.Processor.API/Delivery.Processor.API.Tests/Services/HotColdRefreshServiceTests.cs" },
    { file: "Delivery.Processor.API.sln", stat: "+11", path: "/Delivery.Processor.API/Delivery.Processor.API.sln" },
    { file: "README.md", stat: "+20", path: "/README.md" }
  ];

  var valueMetrics = {
    labels: [
      "Planning Cycle Time",
      "Artifact Consistency",
      "Requirements Traceability",
      "Implementation Readiness"
    ],
    values: [38, 44, 52, 35]
  };

  function createDocActions(docIndex) {
    var doc = docsData[docIndex];
    if (!doc) {
      return null;
    }

    var actions = document.createElement("div");
    actions.className = "flow-actions";

    var viewButton = document.createElement("button");
    viewButton.className = "button";
    viewButton.type = "button";
    viewButton.textContent = "View Documents";
    viewButton.setAttribute("data-doc-index", String(docIndex));

    var sourceLink = document.createElement("a");
    sourceLink.className = "button ghost doc-link";
    sourceLink.href = doc.source;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    sourceLink.textContent = "Open Source";

    actions.appendChild(viewButton);
    actions.appendChild(sourceLink);
    return actions;
  }

  function renderTimeline() {
    var container = document.getElementById("timeline");
    if (!container) {
      return;
    }

    var mainGroup = document.createElement("section");
    mainGroup.className = "timeline-main-group reveal";

    var mainGroupDesc = document.createElement("p");
    mainGroupDesc.className = "timeline-main-group-desc";
    mainGroupDesc.textContent = "xml: small human generated prompt files, md: ai generated markdown documents.";

    var mainList = document.createElement("div");
    mainList.className = "timeline-main-list";

    var groupedSection = document.createElement("section");
    groupedSection.className = "timeline-group reveal";

    var groupedTitle = document.createElement("p");
    groupedTitle.className = "timeline-group-title";
    groupedTitle.textContent = "Artifacts 3-7 can be prepared in parallel after Artifact 2.";

    var groupedList = document.createElement("div");
    groupedList.className = "timeline-list";

    timelineData.forEach(function (item, index) {
      var card = document.createElement("article");
      card.className = "timeline-item reveal";

      if (index === 1) {
        card.classList.add("timeline-item-main");
      }

      var tag = document.createElement("span");
      tag.className = "timeline-tag";
      tag.textContent = item.step;

      var content = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.textContent = item.title;

      var p = document.createElement("p");
      p.textContent = item.text;

      content.appendChild(h3);
      content.appendChild(p);

      var docIndex = timelineDocMap[index];
      if (docIndex !== null && docIndex !== undefined) {
        var actions = createDocActions(docIndex);
        if (actions) {
          content.appendChild(actions);
        }
      }

      card.appendChild(tag);
      card.appendChild(content);

      if (index >= 2) {
        groupedList.appendChild(card);
      } else {
        mainList.appendChild(card);
      }
    });

    groupedSection.appendChild(groupedTitle);
    groupedSection.appendChild(groupedList);
    mainList.appendChild(groupedSection);

    mainGroup.appendChild(mainGroupDesc);
    mainGroup.appendChild(mainList);
    container.appendChild(mainGroup);
  }

  function lockScroll() {
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.paddingRight = scrollbarWidth + "px";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.documentElement.style.overflow = "";
    document.documentElement.style.paddingRight = "";
    document.body.style.overflow = "";
  }

  function getModalElements() {
    return {
      modal: document.getElementById("doc-modal"),
      kind: document.getElementById("doc-modal-kind"),
      title: document.getElementById("doc-modal-title"),
      path: document.getElementById("doc-modal-path"),
      highlights: document.getElementById("doc-modal-highlights"),
      link: document.getElementById("doc-modal-link")
    };
  }

  function openDocModal(doc) {
    var elements = getModalElements();
    if (!elements.modal) {
      return;
    }

    elements.kind.textContent = doc.kind;
    elements.title.textContent = doc.title;
    elements.path.textContent = doc.source;
    elements.link.href = doc.source;

    var container = elements.highlights;
    container.innerHTML = "";

    (doc.highlights || []).forEach(function (h) {
      var card = document.createElement("div");
      card.className = "doc-highlight-card";
      if (h.rowSpan) {
        card.style.gridRow = "span " + h.rowSpan;
      }

      var label = document.createElement("p");
      label.className = "doc-highlight-label";
      label.textContent = h.label;
      card.appendChild(label);

      if (h.items && h.items.length) {
        var ul = document.createElement("ul");
        h.items.forEach(function (item) {
          var li = document.createElement("li");
          li.textContent = item;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      } else if (h.text) {
        var p = document.createElement("p");
        p.textContent = h.text;
        card.appendChild(p);
      }

      container.appendChild(card);
    });

    elements.modal.hidden = false;
    elements.modal.setAttribute("aria-hidden", "false");
    lockScroll();
  }

  function closeDocModal() {
    var elements = getModalElements();
    if (!elements.modal) {
      return;
    }

    elements.modal.hidden = true;
    elements.modal.setAttribute("aria-hidden", "true");
    if (elements.highlights) {
      elements.highlights.innerHTML = "";
    }
    unlockScroll();
  }

  function enableDocumentViewer() {
    var flowSlide = document.getElementById("slide-flow");
    var modal = document.getElementById("doc-modal");

    if (flowSlide) {
      flowSlide.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-doc-index]");
        if (!button) {
          return;
        }

        var index = Number(button.getAttribute("data-doc-index"));
        if (!Number.isFinite(index) || !docsData[index]) {
          return;
        }

        openDocModal(docsData[index]);
      });
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target && event.target.getAttribute && event.target.getAttribute("data-close-modal") === "true") {
          closeDocModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeDocModal();
      }
    });
  }

  function enableRevealAnimations() {
    var targets = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    }, {
      threshold: 0.18
    });

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  function enableNavigation() {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    var current = 0;

    function scrollToSlide(index) {
      if (index < 0 || index >= slides.length) {
        return;
      }

      current = index;
      slides[current].scrollIntoView({ behavior: "smooth", block: "start" });
    }

    var nextBtn = document.getElementById("next-btn");
    var prevBtn = document.getElementById("prev-btn");

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        scrollToSlide(Math.min(current + 1, slides.length - 1));
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        scrollToSlide(Math.max(current - 1, 0));
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") {
        scrollToSlide(Math.min(current + 1, slides.length - 1));
      }
      if (event.key === "ArrowLeft") {
        scrollToSlide(Math.max(current - 1, 0));
      }
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var idx = slides.indexOf(entry.target);
          if (idx >= 0) {
            current = idx;
          }
        }
      });
    }, {
      threshold: 0.6
    });

    slides.forEach(function (slide) {
      observer.observe(slide);
    });
  }

  function enablePrintButton() {
    var button = document.getElementById("print-btn");
    if (!button) {
      return;
    }

    button.addEventListener("click", function () {
      window.print();
    });
  }

  function renderStatCell(stat) {
    var td = document.createElement("td");
    td.className = "stat-cell";
    var match = stat.match(/^(-\d+)?(\+\d+)$/);
    if (match) {
      if (match[1]) {
        var del = document.createElement("span");
        del.className = "diff-del";
        del.textContent = match[1];
        td.appendChild(del);
      }
      if (match[2]) {
        var add = document.createElement("span");
        add.className = "diff-add";
        add.textContent = match[2];
        td.appendChild(add);
      }
    } else {
      td.textContent = stat;
    }
    return td;
  }

  function renderChangesTable(data) {
    var table = document.createElement("table");
    table.className = "list-table";

    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    ["File", "Changes", "Path"].forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col;
      if (col === "Path") {
        th.className = "path-header";
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    data.forEach(function (item) {
      var tr = document.createElement("tr");

      var fileTd = document.createElement("td");
      fileTd.className = "file-cell";
      fileTd.textContent = item.file;

      var pathTd = document.createElement("td");
      pathTd.className = "path-cell";
      pathTd.textContent = item.path;

      tr.appendChild(fileTd);
      tr.appendChild(renderStatCell(item.stat));
      tr.appendChild(pathTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderTasksTable() {
    var table = document.createElement("table");
    table.className = "list-table";

    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    ["ID", "Title", "State", "AI Used", "AI Tool", "Savings (h)"].forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    tasksData.forEach(function (task) {
      var tr = document.createElement("tr");

      var idTd = document.createElement("td");
      idTd.textContent = task.id;

      var titleTd = document.createElement("td");
      titleTd.textContent = task.title;

      var stateTd = document.createElement("td");
      stateTd.textContent = task.state;

      var aiUsedTd = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = task.aiUsed ? "badge-yes" : "badge-no";
      badge.textContent = task.aiUsed ? "Yes" : "No";
      aiUsedTd.appendChild(badge);

      var aiTypeTd = document.createElement("td");
      aiTypeTd.textContent = task.aiType || "—";

      var savingsTd = document.createElement("td");
      savingsTd.textContent = task.aiSavings != null ? task.aiSavings + "h" : "—";

      tr.appendChild(idTd);
      tr.appendChild(titleTd);
      tr.appendChild(stateTd);
      tr.appendChild(aiUsedTd);
      tr.appendChild(aiTypeTd);
      tr.appendChild(savingsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderTestCasesTable() {
    var table = document.createElement("table");
    table.className = "list-table";

    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    ["ID", "Title", "State"].forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    testCasesData.forEach(function (tc) {
      var tr = document.createElement("tr");

      var idTd = document.createElement("td");
      idTd.textContent = tc.id;

      var titleTd = document.createElement("td");
      titleTd.textContent = tc.title;

      var stateTd = document.createElement("td");
      stateTd.textContent = tc.state;

      tr.appendChild(idTd);
      tr.appendChild(titleTd);
      tr.appendChild(stateTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function openListModal(type) {
    var modal = document.getElementById("list-modal");
    var kindEl = document.getElementById("list-modal-kind");
    var titleEl = document.getElementById("list-modal-title");
    var bodyEl = document.getElementById("list-modal-body");
    if (!modal) {
      return;
    }

    bodyEl.innerHTML = "";
    if (type === "tasks") {
      kindEl.textContent = "Azure DevOps";
      titleEl.textContent = "Created Tasks (22)";
      bodyEl.appendChild(renderTasksTable());
    } else if (type === "test-cases") {
      kindEl.textContent = "Azure DevOps";
      titleEl.textContent = "Created Test Cases (20)";
      bodyEl.appendChild(renderTestCasesTable());
    } else if (type === "db-changes") {
      kindEl.textContent = "Pull Request";
      titleEl.textContent = "Database Changes (" + dbChangesData.length + " files)";
      bodyEl.appendChild(renderChangesTable(dbChangesData));
    } else if (type === "api-changes") {
      kindEl.textContent = "Pull Request";
      titleEl.textContent = "Processor API Changes (" + apiChangesData.length + " files)";
      bodyEl.appendChild(renderChangesTable(apiChangesData));
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    lockScroll();
  }

  function closeListModal() {
    var modal = document.getElementById("list-modal");
    if (!modal) {
      return;
    }
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    var bodyEl = document.getElementById("list-modal-body");
    if (bodyEl) {
      bodyEl.innerHTML = "";
    }
    unlockScroll();
  }

  function enableListModal() {
    var valueSlide = document.getElementById("slide-value");
    var modal = document.getElementById("list-modal");

    if (valueSlide) {
      valueSlide.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-list-modal]");
        if (!button) {
          return;
        }
        var type = button.getAttribute("data-list-modal");
        openListModal(type);
      });
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target && event.target.getAttribute && event.target.getAttribute("data-close-list-modal") === "true") {
          closeListModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeListModal();
      }
    });
  }

  function openVideoModal() {
    var modal = document.getElementById("video-modal");
    if (!modal) {
      return;
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    lockScroll();
  }

  function closeVideoModal() {
    var modal = document.getElementById("video-modal");
    if (!modal) {
      return;
    }
    var player = document.getElementById("video-modal-player");
    if (player) {
      player.pause();
      player.currentTime = 0;
    }
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    unlockScroll();
  }

  function enableVideoModal() {
    var btn = document.getElementById("play-test-cases-video-btn");
    var modal = document.getElementById("video-modal");

    if (btn) {
      btn.addEventListener("click", openVideoModal);
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target && event.target.getAttribute && event.target.getAttribute("data-close-video-modal") === "true") {
          closeVideoModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeVideoModal();
      }
    });
  }

  function renderChart() {
    var canvas = document.getElementById("value-chart");
    if (!canvas || !window.presentationCharts) {
      return;
    }

    window.presentationCharts.drawValueChart(canvas, valueMetrics.labels, valueMetrics.values);
  }

  function init() {
    renderTimeline();
    renderChart();
    enableRevealAnimations();
    enableNavigation();
    enablePrintButton();
    enableDocumentViewer();
    enableListModal();
    enableVideoModal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
