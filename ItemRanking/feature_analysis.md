**Document Version**: 2.1  
**Date**: 2025-01-03  
**Author**: AI Generated, Updated per requirements  
**Reviewers**: Development Team, QA, DevOps, Architecture  
**Status**: Ready for Implementation  
**Change Log** 
    **Date**: 2025-12-29: Removed StoreCode requirement, simplified to item-level only data model
    **Date**: 2025-01-03: Replaced FileTimestamp with BlobName for tracking processed blobs

# Feature Analysis Document: Item Ranking Integration for Delivery System

## Executive Summary

This document provides a comprehensive analysis for integrating Item Ranking data from **storage account files** into the Delivery system to support Hot/Cold value calculations for tub/sets. The solution replaces the current mock-based approach with a database-driven implementation that imports, stores, and retrieves Last7DaysSalesValue data **at the item level only** (no store-specific data).

---

## 1. Business Context

### 1.1 Current State
- HotColdRefreshService uses `IMobileApiClientMock.GetItemRanking()` to retrieve Last7DaysSalesValue
- Mock-based approach provides test data but lacks real storage account integration
- No persistent storage of item ranking data within Delivery system

### 1.2 Desired State
- Real-time integration with Item Ranking files from storage account
- Persistent storage of item ranking data in Delivery database **without store-level granularity**
- Database-driven lookup for Hot/Cold calculations
- Data refresh synchronized with GI/GID file processing

### 1.3 Business Value
- Accurate Hot/Cold value calculations based on real sales data
- Improved inventory prioritization for store operations
- Elimination of mock dependencies in production environment
- Audit trail of item ranking data with file timestamp tracking
- Simplified data model (item-level only, no store complexity)

---

## 2. Technical Architecture

### 2.1 Data Flow Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Storage Account File Generation                            │
│    • data.ItemRank.{timestamp}.zip (contains CSV)             │
│    • trigger.ItemRank.{timestamp}.trigger                     │
│    Note: branch.ItemRank file NOT required for this solution  │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. Data Integration Platform                                  │
│    • Storage Account: dataintstinsdeveuw                      │
│    • File Map Record added to DevelopmentSetupData.cs         │
│    • Automatic file transfer orchestration                    │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. TP-Partner Storage Account                                 │
│    • Storage Account: nxdataintprstinsdeveuw                  │
│    • Container: deliveryitemranking                           │
│    • Files stored as GUID blobs (e.g., {guid}/data.ItemRank) │
│    • Use GetBlobInformation to retrieve source file names     │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. Delivery Processor Import Service                          │
│    • DeliveryItemRankingService.cs (NEW)                      │
│    • GetBlobInformation to retrieve source file metadata      │
│    • Extract timestamp from source file name                  │
│    • Direct CSV parsing from blob (no ZIP extraction needed)  │
│    • Build List<ItemRanking> (no store grouping)             │
│    • Batch database insert/update                             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. Delivery Database                                          │
│    • Table: delivery.ItemRanking                              │
│    • Stored Procedure: delivery.InsertOrUpdateItemRanking     │
│    • Stored Procedure: delivery.GetItemRanking                │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 6. HotColdRefreshService                                      │
│    • Replace IMobileApiClientMock with repository call        │
│    • Query delivery.ItemRanking via DeliveryDalRepository     │
│    • Calculate HotColdValue using Last7DaysSalesValue         │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Execution Sequence

```
DeliveryFileImportFunction (Timer Trigger)
    ↓
1. NEW: await _itemRankingProcessor.ProcessItemRankingFilesAsync()
    ├─ Get blob items from deliveryitemranking container
    ├─ For each data.ItemRank blob:
    │   ├─ Call GetBlobInformation(blobGuid) to get source file name
    │   ├─ Parse source file name to extract timestamp
    │   └─ Validate file name pattern (data.ItemRank.{timestamp}.zip)
    ├─ Read data blob → Parse CSV lines (already extracted, no ZIP)
    ├─ Build List<ItemRankingModel> (no store grouping required)
    ├─ Batch insert to delivery.ItemRanking (10k records per batch)
    └─ Move processed blobs to success/failed containers
    ↓
2. EXISTING: await _deliveryProcessor.ProcessBlobData(...)
    ├─ Process GI/GID files
    └─ Container data loaded
    ↓
3. EXISTING: await _combinedRefreshService.FillInDbDataFromService()
    └─ HotColdRefreshService.CalculateValue
        ├─ Query delivery.ItemRanking via repository (all items)
        └─ Calculate HotColdValue using Last7DaysSalesValue
```

---

## 3. Database Design

### 3.1 Table Schema

```sql
CREATE TABLE [delivery].[ItemRanking]
(
    [ItemRankingId]         BIGINT IDENTITY(1,1) NOT NULL,
    [ItemNumber]            CHAR(6) NOT NULL,
    [Last7DaysSalesValue]   DECIMAL(9,2) NOT NULL,
    [ImportTimestamp]       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [BlobName]              VARCHAR(40) NOT NULL,
    [CreatedAt]             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [UpdatedAt]             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    
    CONSTRAINT [PK_ItemRanking] PRIMARY KEY CLUSTERED 
    (
        [ItemRankingId] ASC
    ),
    
    CONSTRAINT [UQ_ItemRanking_ItemNumber] UNIQUE 
    (
        [ItemNumber]
    )
)

CREATE NONCLUSTERED INDEX [IX_ItemRanking_ItemNumber] 
ON [delivery].[ItemRanking] ([ItemNumber])
INCLUDE ([Last7DaysSalesValue])
```

**Design Decisions:**
- **Single-record per Item**: UNIQUE constraint on ItemNumber ensures only latest ranking persists
- **No store-level data**: Simplified model removes StoreCode column entirely
- **No historical tracking**: Simplifies queries and reduces storage (per requirements)
- **Optimized index**: Covers query pattern for HotCold calculations
- **BlobName**: Audit field for tracking which blob GUID was processed (supports idempotency)

### 3.2 User-Defined Type

```sql
CREATE TYPE [delivery].[ItemRankingType] AS TABLE
(
    [ItemNumber]            CHAR(6) NOT NULL,
    [Last7DaysSalesValue]   DECIMAL(9,2) NOT NULL,
    [BlobName]              VARCHAR(40) NOT NULL
)
```

### 3.3 Stored Procedures

#### 3.3.1 Insert/Update Procedure

```sql
CREATE PROCEDURE [delivery].[InsertOrUpdateItemRanking] 
    @Data [delivery].[ItemRankingType] READONLY
AS
BEGIN TRY
    SET NOCOUNT ON;

    BEGIN TRAN
        DROP TABLE IF EXISTS #ItemRanking

        CREATE TABLE #ItemRanking
        (
            [ItemNumber]            CHAR(6) NOT NULL,
            [Last7DaysSalesValue]   DECIMAL(9,2) NOT NULL,
            [BlobName]              VARCHAR(40) NOT NULL
        )

        INSERT INTO #ItemRanking
        SELECT [ItemNumber], [Last7DaysSalesValue], [BlobName]
        FROM @Data

        MERGE [delivery].[ItemRanking] AS target
        USING #ItemRanking AS source
        ON (target.[ItemNumber] = source.[ItemNumber])
        WHEN MATCHED THEN
            UPDATE SET
                target.[Last7DaysSalesValue] = source.[Last7DaysSalesValue],
                target.[BlobName] = source.[BlobName],
                target.[ImportTimestamp] = SYSUTCDATETIME(),
                target.[UpdatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT ([ItemNumber], [Last7DaysSalesValue], [BlobName], [ImportTimestamp], [CreatedAt], [UpdatedAt])
            VALUES (source.[ItemNumber], source.[Last7DaysSalesValue], source.[BlobName], SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME());

    COMMIT TRAN

END TRY
BEGIN CATCH
    ROLLBACK TRAN;
    THROW;
END CATCH;
```

#### 3.3.2 Retrieval Procedure

```sql
CREATE PROCEDURE [delivery].[GetItemRanking]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        [ItemNumber],
        [Last7DaysSalesValue]
    FROM [delivery].[ItemRanking]
END
```

**Note**: No store code parameter - returns all item rankings for application-wide use.

---

## 4. Component Design

### 4.1 DeliveryItemRankingService

**Location**: `Delivery.Processor.API\Services\DeliveryItemRankingService.cs`

**Responsibilities**:
1. Read blobs from `deliveryitemranking` container (stored as GUID paths)
2. Call `GetBlobInformation(blobGuid)` to retrieve source file names
3. Filter for data.ItemRank files only (ignore branch files if present)
4. Extract timestamp from source file name for audit trail
5. Parse data blob to extract item ranking CSV data (already extracted, no ZIP)
6. Build list of ItemRankingModel (no store grouping)
7. Transform to batch insert model
8. Execute batch insert via repository
9. Handle errors and logging (Application Insights)
10. Move processed blobs to success/failed containers

**Key Methods**:
```csharp
public interface IDeliveryItemRankingService
{
    Task ProcessItemRankingFilesAsync();
}

public class DeliveryItemRankingService : IDeliveryItemRankingService
{
    private readonly IItemRankingRepository _repository;
    private readonly IBlobStorageProcessor _blobStorageProcessor;
    private readonly IBlobProcessingClient _blobProcessingClient;
    private readonly ILogger<DeliveryItemRankingService> _logger;
    private readonly TelemetryClient _telemetryClient;
    private readonly IConfiguration _configuration;

    // Main orchestration method
    public async Task ProcessItemRankingFilesAsync();
    
    // Get blob information using existing pattern
    private async Task<BlobInformation> GetBlobInformation(string blobGuid);
    
    // Extract timestamp from source file name
    private string ExtractTimestamp(string fileName);
    
    // Parse data blob (CSV, no ZIP extraction)
    private async Task<List<ItemRankingModel>> ParseDataBlobAsync(
        BlobClient dataBlobClient, 
        string blobGuid);
    
    // Save to database
    private async Task SaveItemRankingDataAsync(
        List<ItemRankingModel> itemRankings);
}
```

### 4.2 Repository Implementation

**Location**: `Delivery.Processor.API\Repositories\ItemRankingRepository.cs`

**New Repository** (separate from DeliveryDalRepository):
```csharp
public interface IItemRankingRepository
{
    Task InsertOrUpdateItemRankingAsync(List<ItemRankingModel> itemRankings);
    Task<List<ItemRankingModel>> GetItemRankingAsync();
}

public class ItemRankingRepository : IItemRankingRepository
{
    private readonly IConnectionFactory _connectionFactory;
    private readonly ILogger<ItemRankingRepository> _logger;

    // Batch insert/update using stored procedure
    public async Task InsertOrUpdateItemRankingAsync(List<ItemRankingModel> itemRankings);

    // Query all item rankings (no store filter)
    public async Task<List<ItemRankingModel>> GetItemRankingAsync();
}
```

### 4.3 Model Classes

**Location**: `Delivery.Processor.API\Models\`

```csharp
// Unified model for database operations and repository
public class ItemRankingModel
{
    public string ItemNumber { get; set; }
    public decimal Last7DaysSalesValue { get; set; }
    public string BlobName { get; set; } // GUID blob name for tracking
}
```

**Removed Models**:
- ~~StoreItemRankingModel~~ (no store code needed)
- ~~ItemRankingFilePair~~ (no branch file matching needed)
- ItemRanking class simplified to ItemRankingModel

---

## 5. Integration Points

### 5.1 Data Integration Platform Changes

**File**: `DataIntgeration.Data.API\Constants\DevelopmentSetupData.cs`

**Changes Required**:
```csharp
public static IEnumerable<FileMapRecord> GetFileMap()
{
    var fileMappings = new List<FileMapRecord>
    {
        // ... existing mappings ...
        
        // Item Ranking Files - stored as GUID blobs in TP-Partner storage
        // NOTE: Only data.ItemRank is required for import
        new FileMapRecord(partitionKey, "data.ItemRank%.zip") 
        { 
            ContainerName = "deliveryitemranking", 
            HasRestrictedData = false
        },
        new FileMapRecord(partitionKey, "trigger.ItemRank%.trigger") 
        { 
            ContainerName = "deliveryitemranking", 
            HasRestrictedData = false
        }
    };
    
    return fileMappings;
}
```

**Note**: branch.ItemRank file mapping NOT required for this solution.

### 5.2 DeliveryFileImportFunction Changes

**File**: `Delivery.Processor.API\Functions\DeliveryFileImportFunction.cs`

**Changes Required**:
```csharp
public class DeliveryFileImportFunction
{
    private readonly ILogger<DeliveryFileImportFunction> _logger;
    private readonly IBlobDataProcessor _deliveryProcessor;
    private readonly ICombinedRefreshService _combinedRefreshService;
    private readonly IDeliveryItemRankingService _itemRankingService; // NEW
    private readonly IConfiguration _configuration;

    public DeliveryFileImportFunction(
        ILogger<DeliveryFileImportFunction> logger, 
        IBlobDataProcessor deliveryProcessor, 
        ICombinedRefreshService combinedRefreshService, 
        IDeliveryItemRankingService itemRankingService, // NEW
        IConfiguration configuration)
    {
        _deliveryProcessor = deliveryProcessor;
        _combinedRefreshService = combinedRefreshService;
        _itemRankingService = itemRankingService; // NEW
        _configuration = configuration;
        _logger = logger;
    }

    [Function("DeliveryFileImport")]
    public async Task Run([TimerTrigger("%Delivery:Processor:TimerTriggerCRON%")]TimerInfo myTimer)
    {
        _logger.LogInformation($"C# Timer trigger function executed at: {DateTime.UtcNow}");

        // STEP 1: Process Item Ranking files FIRST
        await _itemRankingService.ProcessItemRankingFilesAsync();
        
        // STEP 2: Process GI/GID files
        await _deliveryProcessor.ProcessBlobData(_configuration[Constants.DeliveryFileTagKey]);
        
        // STEP 3: Run refresh services (including HotCold)
        await _combinedRefreshService.FillInDbDataFromService();
    }
}
```

### 5.3 HotColdRefreshService Changes

**File**: `Delivery.Processor.API\Services\HotColdRefreshService.cs`

**Changes Required**:
```csharp
// BEFORE (lines 195-220):
private async Task<IList<Container>> CalculateValue(IList<Container> containers, bool recalculate)
{
    // ... existing code ...
    
    var result = await this._mobileApiClientMock.GetItemRanking(itemRankings.ToList());
    
    if (!result.IsSuccess)
    {
        // ... error handling ...
        return containers;
    }
    
    itemRankings = result.Result;
    
    foreach(var c in containers)
    {
        foreach(var i in c.Items)
        { 
            if (itemRankings.All(j => j.ItemNumber != i.ItemNumber))
                continue;
            
            c.HotColdValue += (int)itemRankings.First(j => j.ItemNumber == i.ItemNumber)?.Last7DaysSalesValue;
        }
    }
    
    return containers;
}

// AFTER:
private async Task<IList<Container>> CalculateValue(
    IList<Container> containers, 
    bool recalculate)
{
    var contextMetrics = new Dictionary<string, object>
    {
        {"LoggingIdentifier", Constants.DeliveryDataRefreshLoggingIdentifier},
        {"StartedUpdating", DateTime.UtcNow},
        {"Service", "HotCold Calculation Service"}
    };

    containers = recalculate 
        ? containers 
        : containers.Where(c => c.HotColdValue <= 0).ToList();

    // NEW: Get all item rankings from database (no store filter)
    var itemRankings = await _itemRankingRepository.GetItemRankingAsync();
    
    if (itemRankings == null || !itemRankings.Any())
    {
        contextMetrics.Add("Status", "NoItemRankingData");
        _logger.WithContext(contextMetrics).LogWarning(
            CustomEvents.DataNotFound,
            $"{Constants.DeliveryDataRefreshLoggingIdentifier}: No Item Ranking data found in database");
        
        return containers;
    }

    // Build dictionary for fast lookup
    var itemRankingDict = itemRankings.ToDictionary(
        ir => ir.ItemNumber, 
        ir => ir.Last7DaysSalesValue);

    foreach (var container in containers)
    {
        foreach (var item in container.Items)
        {
            if (itemRankingDict.TryGetValue(item.ItemNumber, out var salesValue))
            {
                container.HotColdValue += (int)salesValue;
            }
        }
    }

    _logger.WithContext(contextMetrics).LogInformation(
        $"Finished calculating hot cold value for {containers.Count} containers using {itemRankings.Count} item rankings");

    return containers;
}
```

**Note**: No storeCode parameter needed - method signature remains compatible with existing calls.

---

## 6. GUID Blob Handling Pattern

### 6.1 GetBlobInformation Usage

**Pattern from BlobDataProcessor.cs**:
```csharp
// Step 1: Get blob items from container
var blobItems = blobContainerClient.GetBlobs(BlobTraits.None, BlobStates.All, prefix: "deliveryitemranking")
    .Where(w => !w.Deleted && w.Properties.LeaseState != LeaseState.Leased)
    .OrderBy(o => o.Properties.LastModified);

// Step 2: For each blob GUID, get source file information
foreach (var blobItem in blobItems)
{
    var guidFileName = blobItem.Name.GetGuildFileName(); // Extract GUID from path
    
    if (String.IsNullOrEmpty(guidFileName))
        continue;
    
    // Step 3: Call GetBlobInformation API to get source file details
    var blobInformationRequest = new BlobInformationRequest()
    {
        BlobName = guidFileName,
        PartnerCode = _configuration[Constants.EnvironmentNameKey]
    };
    
    var blobInformationResponse = await _blobProcessingClient.GetBlobInformation(
        blobInformationRequest, 
        requestOptions: ClientHelper.GetHttpServiceClientRequestOptions());
    
    if (!blobInformationResponse.IsSuccess || blobInformationResponse.Result == null)
    {
        _logger.LogWarning($"Failed to get blob information for {guidFileName}");
        continue;
    }
    
    var blobInformation = new BlobInformation()
    {
        BlobIdentifier = blobInformationResponse.Result.BlobIdentifier,
        DistributionType = blobInformationResponse.Result.DistributionType,
        DistributionIdentifier = blobInformationResponse.Result.DistributionIdentifier,
        FileName = blobInformationResponse.Result.FileName // Source file name!
    };
    
    // Step 4: Filter for data.ItemRank files only
    if (blobInformation.FileName.Contains("data.ItemRank"))
    {
        // Extract timestamp from "data.ItemRank.2512140047162.zip"
        var timestamp = ExtractTimestamp(blobInformation.FileName);
        
        if (!string.IsNullOrEmpty(timestamp))
        {
            // Process this blob
            await ProcessDataBlob(blobItem, timestamp);
        }
    }
}
```

### 6.2 Timestamp Extraction Logic

```csharp
private string ExtractTimestamp(string fileName)
{
    // Pattern: data.ItemRank.2512140047162.zip
    var pattern = @"\.ItemRank\.(\d+)\.";
    var match = Regex.Match(fileName, pattern);
    
    if (match.Success)
    {
        return match.Groups[1].Value; // Returns "2512140047162"
    }
    
    _logger.LogWarning($"Could not extract timestamp from {fileName}");
    return null;
}
```

---

## 7. File Parsing Details

### 7.1 Data File Format (CSV - No ZIP Extraction)

**Key Change**: Files in TP-Partner storage are already extracted GUID blobs, no ZIP extraction needed

**Format**: CSV with columns: ItemNumber,Last7DaysSaleUnit,Last7DaysSalesValue,FutureSeasonEndUnit,FutureSeasonEndValue,NextSeasonEndUnit,NextSeasonEndValue

**Parsing Logic**:
```csharp
private async Task<List<ItemRankingModel>> ParseDataBlobAsync(
    BlobClient dataBlobClient, 
    string blobGuid)
{
    var itemRankings = new List<ItemRankingModel>();
    
    // NOTE: Blob is already CSV format (no ZIP extraction)
    var stream = await dataBlobClient.OpenReadAsync();
    using (var streamReader = new StreamReader(stream, Encoding.UTF8))
    {
        while (await streamReader.ReadLineAsync() is { } line)
        {
            var parts = line.Split(',');
            
            if (parts.Length >= 3)
            {
                itemRankings.Add(new ItemRankingModel
                {
                    ItemNumber = parts[0].Trim(),
                    // parts[1] = Last7DaysSaleUnit (not stored, per requirements)
                    Last7DaysSalesValue = decimal.TryParse(parts[2], out var value) ? value : 0,
                    BlobName = blobGuid
                    // parts[3-6] = Future/Next season data (parsed but not stored)
                });
            }
        }
    }
    
    return itemRankings;
}
```

---

## 8. Error Handling Strategy

### 8.1 GetBlobInformation Errors

**Scenario**: API call fails or returns no data

**Handling**:
```csharp
try
{
    var blobInfo = await GetBlobInformation(blobGuid);
}
catch (Exception ex)
{
    contextMetrics.Add("ErrorType", "GetBlobInformationFailed");
    contextMetrics.Add("BlobGuid", blobGuid);
    
    _logger.WithContext(contextMetrics).LogError(
        CustomEvents.BlobInformationRetrievalFailed,
        ex,
        $"Failed to get blob information for GUID {blobGuid}");
    
    // Skip this blob, continue with next
    continue;
}
```

### 8.2 Database Insert Errors

**Scenario**: Database connection failure or constraint violation

**Handling**:
```csharp
try
{
    await _repository.InsertOrUpdateItemRankingAsync(itemRankingModels);
    
    contextMetrics.Add("RecordsInserted", itemRankingModels.Count);
    _logger.WithContext(contextMetrics).LogInformation(
        CustomEvents.DataInsertSuccessful,
        $"Inserted {itemRankingModels.Count} item ranking records");
}
catch (Exception ex)
{
    contextMetrics.Add("ErrorType", "DatabaseInsertFailed");
    _logger.WithContext(contextMetrics).LogError(
        CustomEvents.DatabaseOperationFailed,
        ex,
        $"Failed to insert item ranking data for timestamp {blobTimestamp}");
    
    // Move blob to failed container
    await MoveBlobToFailedContainer(dataBlobClient);
    
    throw; // Re-throw to fail the function run
}
```

### 8.3 HotCold Calculation Errors

**Scenario**: No item ranking data available

**Handling**:
```csharp
var itemRankings = await _itemRankingRepository.GetItemRankingAsync();

if (itemRankings == null || !itemRankings.Any())
{
    contextMetrics.Add("Status", "NoItemRankingData");
    
    _logger.WithContext(contextMetrics).LogWarning(
        CustomEvents.DataNotFound,
        $"No Item Ranking data found in database. HotCold values will remain at 0.");
    
    // Continue processing without item ranking data
    // Containers will retain HotColdValue = 0
    return containers;
}
```

---

## 9. Configuration Requirements

### 9.1 App Settings

**File**: `local.settings.json` / Azure App Configuration

```json
{
  "Values": {
    "ItemRanking:Storage:ConnectionString": "...",
    "ItemRanking:Storage:ContainerName": "deliveryitemranking",
    "ItemRanking:Storage:SuccessContainer": "itemranking-success",
    "ItemRanking:Storage:FailedContainer": "itemranking-failed",
    "ItemRanking:FilePattern:Data": "data.ItemRank",
    "ItemRanking:BatchSize": "10000"
  }
}
```

### 9.2 Constants

**File**: `Delivery.Processor.API\Helpers\Constants.ItemRanking.cs` (NEW)

```csharp
public static class Constants
{
    public static class ItemRanking
    {
        public const string LoggingIdentifier = "ItemRankingImport";
        public const string DataFilePattern = "data.ItemRank";
        public const string TimestampPattern = @"\.ItemRank\.(\d+)\.";
        public const int DefaultBatchSize = 10000;
    }
}
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

**File**: `Delivery.Processor.API.Tests\Services\DeliveryItemRankingServiceTests.cs`

**Test Cases**:
1. `GetBlobInformation_ValidGuid_ReturnsBlobInfo`
2. `ParseDataBlob_ValidCSV_ReturnsItemRankings`
3. `ExtractBlobGuid_ValidBlobPath_ReturnsGuid`
4. `ExtractBlobGuid_InvalidPath_ReturnsNull`
5. `ProcessFiles_DatabaseError_MovesToFailedContainer`
6. `ProcessFiles_ValidData_InsertsToDatabase`

### 10.2 Integration Tests

**File**: `Delivery.Processor.API.IntegrationTest\ItemRankingImportIntegrationTest.cs`

**Test Cases**:
1. `ProcessItemRankingFiles_EndToEnd_InsertsToDatabase`
2. `HotColdCalculation_WithItemRanking_CalculatesCorrectValues`
3. `ProcessFiles_DuplicateBlob_UpdatesExistingRecords`
4. `GetItemRanking_NoData_ReturnsEmptyList`

### 10.3 Test Data

**Data Blob** (GUID: `{guid}/data.ItemRank`, Source: `data.ItemRank.2512140047162.zip`, CSV format):
```
AA1363,0,0.00,283,6792.00,150,3600.00
AA1400,0,0.00,22,792.00,0,0.00
BB2501,15,450.50,100,3000.00,50,1500.00
```

---

## 11. Deployment Plan

### 11.1 Database Changes (Phase 1)

**Order**:
1. Create User-Defined Type: `delivery.ItemRankingType`
2. Create Table: `delivery.ItemRanking`
3. Create Stored Procedure: `delivery.InsertOrUpdateItemRanking`
4. Create Stored Procedure: `delivery.GetItemRanking`

**Rollback Strategy**: Drop objects in reverse order

### 11.2 Application Code (Phase 2)

**Order**:
1. Deploy Data Integration file mappings (data.ItemRank only)
2. Deploy Delivery Processor code:
   - Models (ItemRankingModel)
   - Repository (ItemRankingRepository)
   - DeliveryItemRankingService
   - Interface registrations in Program.cs
3. Deploy DeliveryFileImportFunction changes
4. Deploy HotColdRefreshService changes

**Feature Flag**: Not required - deployment is additive (no breaking changes)

### 11.3 Validation (Phase 3)

**Steps**:
1. Upload test Item Ranking file to Data Integration storage
2. Verify file transferred to TP-Partner deliveryitemranking container as GUID blob
3. Trigger DeliveryFileImportFunction manually
4. Verify database inserts via SQL query
5. Run HotColdRefreshService and compare results with mock
6. Monitor Application Insights for errors
7. Validate in production after 1 week of monitoring

---

## 12. Monitoring and Observability

### 12.1 Application Insights Metrics

**Custom Events**:
- `ItemRankingImport.FileProcessed` (count, timestamp)
- `ItemRankingImport.RecordsInserted` (count)
- `ItemRankingImport.ProcessingTime` (duration)
- `ItemRankingImport.GetBlobInformationFailed` (error)
- `HotCold.ItemRankingDataNotFound` (warning)

**Custom Metrics**:
```csharp
_telemetryClient.TrackMetric("ItemRanking.FilesProcessed", 1);
_telemetryClient.TrackMetric("ItemRanking.RecordsInserted", itemRankingModels.Count);
_telemetryClient.TrackMetric("ItemRanking.ProcessingDuration", stopwatch.ElapsedMilliseconds);
```

### 12.2 Logging Standards

**Template** (from BlobDataProcessor.cs):
```csharp
var contextMetrics = new Dictionary<string, object>
{
    {"LoggingIdentifier", Constants.ItemRankingLoggingIdentifier},
    {"Timestamp", blobTimestamp},
    {"ItemCount", itemRankings.Count}
};

_logger.WithContext(contextMetrics).LogInformation(
    CustomEvents.ItemRankingProcessed,
    $"Processed Item Ranking file: {itemRankings.Count} items");
```

### 12.3 Alerts

**Recommended Alerts**:
1. **Critical**: No Item Ranking data imported in last 48 hours
2. **Warning**: Database insert failure rate > 5%
3. **Info**: HotCold calculation with no item ranking data

---

## 13. User Stories (Summary)

### Epic: Item Ranking Integration for Delivery System

#### Story 1: Data Integration File Mapping
**As a** Data Integration Platform  
**I want** to configure file mapping for Item Ranking data file  
**So that** it is automatically transferred to the TP-Partner Delivery storage container

**Acceptance Criteria**:
- [ ] File map record added for data.ItemRank (no branch.ItemRank)
- [ ] Files transferred to `deliveryitemranking` container in nxdataintprstinsdeveuw as GUID blobs
- [ ] File transfer logged in Application Insights

---

#### Story 2: Database Schema for Item Ranking
**As a** Delivery Database  
**I want** to store Item Ranking data at the item level  
**So that** HotCold calculations can query real sales data

**Acceptance Criteria**:
- [ ] Table `delivery.ItemRanking` created with required columns (no StoreCode)
- [ ] Unique constraint on ItemNumber
- [ ] Index optimized for item-based queries
- [ ] User-defined type `delivery.ItemRankingType` created
- [ ] Stored procedures for insert/update and retrieval created

---

#### Story 3: Item Ranking Import Service
**As a** Delivery Processor  
**I want** to import Item Ranking files from TP-Partner blob storage  
**So that** item ranking data is available in the database

**Acceptance Criteria**:
- [ ] DeliveryItemRankingService reads GUID blobs from deliveryitemranking container
- [ ] GetBlobInformation API called to retrieve source file names
- [ ] Only data.ItemRank files processed (branch files ignored if present)
- [ ] Data blob parsed correctly (CSV format, no ZIP extraction)
- [ ] List of ItemRankingModel built (no store grouping)
- [ ] Batch insert executed via repository (10k records per batch)
- [ ] Processed blobs moved to success/failed containers
- [ ] All operations logged to Application Insights

---

#### Story 4: Repository Implementation for Item Ranking
**As a** ItemRankingRepository  
**I want** to provide methods for inserting and querying Item Ranking data  
**So that** services can persist and retrieve sales data

**Acceptance Criteria**:
- [ ] `InsertOrUpdateItemRankingAsync` method implemented
- [ ] `GetItemRankingAsync` method implemented (no store filter)
- [ ] Methods use stored procedures
- [ ] Error handling with transaction rollback
- [ ] Unit tests for both methods

---

#### Story 5: Integrate Item Ranking Import into DeliveryFileImportFunction
**As a** DeliveryFileImportFunction  
**I want** to process Item Ranking files before GI/GID files  
**So that** item ranking data is available for HotCold calculations

**Acceptance Criteria**:
- [ ] IDeliveryItemRankingService injected into constructor
- [ ] ProcessItemRankingFilesAsync called before ProcessBlobData
- [ ] Execution sequence: ItemRanking → GI/GID → HotCold
- [ ] Errors in ItemRanking import do not block GI/GID processing
- [ ] Execution logged with timestamps

---

#### Story 6: Replace Mock with Database Lookup in HotColdRefreshService
**As a** HotColdRefreshService  
**I want** to retrieve Last7DaysSalesValue from the database  
**So that** HotCold calculations use real sales data

**Acceptance Criteria**:
- [ ] IMobileApiClientMock.GetItemRanking removed from CalculateValue
- [ ] Repository method GetItemRankingAsync called instead (no store filter)
- [ ] Dictionary lookup replaces LINQ queries for performance
- [ ] Warning logged if no item ranking data found (containers retain HotColdValue=0)
- [ ] Calculation results match mock-based results (validation phase)
- [ ] Unit tests updated to use repository mock
- [ ] Method signature remains compatible (no storeCode parameter added)

---

#### Story 7: End-to-End Integration Testing
**As a** QA Engineer  
**I want** to test the complete Item Ranking flow  
**So that** I can verify data accuracy and system reliability

**Acceptance Criteria**:
- [ ] Integration test uploads test file to Data Integration storage
- [ ] Test verifies file transferred to TP-Partner deliveryitemranking as GUID blob
- [ ] Test triggers DeliveryFileImportFunction
- [ ] Test verifies GetBlobInformation retrieves correct source file name
- [ ] Test verifies database inserts with expected data
- [ ] Test verifies HotCold calculations use database values
- [ ] Test validates duplicate file handling (updates existing records)

---

#### Story 8: Monitoring and Alerting Setup
**As a** DevOps Engineer  
**I want** to monitor Item Ranking import health  
**So that** I can detect and resolve issues proactively

**Acceptance Criteria**:
- [ ] Application Insights custom events configured
- [ ] Custom metrics tracked (files processed, records inserted, duration)
- [ ] Alert created for no imports in 48 hours
- [ ] Alert created for database insert failures > 5%
- [ ] Dashboard created showing import metrics and trends

---

## 14. Open Questions & Risks

### 14.1 Open Questions

| # | Question | Proposed Answer | Status |
|---|----------|-----------------|--------|
| 1 | Should we validate item numbers against existing Delivery items? | No - accept all items from storage account as source of truth | ✓ Answered |
| 2 | What is acceptable latency for file processing? | Target < 5 minutes for typical file sizes (estimate 50k items) | ⏳ Pending Performance Test |
| 3 | Are data blobs in TP-Partner storage already extracted (not ZIP)? | Yes - blobs are CSV format, no ZIP extraction needed | ✓ Confirmed |
| 4 | Is store-level item ranking data required? | No - item-level only, no StoreCode needed | ✓ Answered |

### 14.2 Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | GetBlobInformation API performance bottleneck | Medium | Low | Implement retry logic, monitor API response times |
| 2 | Database table size growth | Low | Low | Monitor table size, implement partitioning if exceeds 50M records |
| 3 | HotCold calculation performance degradation | Medium | Low | Benchmark query performance, validate index effectiveness |
| 4 | Missing store-level granularity in future | High | Medium | Document design decision, plan migration path if requirements change |

---

## 15. Success Criteria

### 15.1 Functional Success Criteria

- [ ] Item Ranking files automatically imported from storage account
- [ ] GUID blobs processed with GetBlobInformation API
- [ ] Data persisted to `delivery.ItemRanking` table (no StoreCode)
- [ ] HotCold calculations use database values instead of mock
- [ ] All operations logged to Application Insights

### 15.2 Non-Functional Success Criteria

- [ ] Item Ranking import completes within 5 minutes for typical file sizes
- [ ] Database queries for item ranking complete within 500ms
- [ ] Zero data loss during file processing
- [ ] 99.9% import success rate over 30-day period
- [ ] All errors tracked and alertable

### 15.3 Validation Criteria

- [ ] Integration tests pass with 100% success rate
- [ ] Production HotCold values match pre-production validation (±5% tolerance)
- [ ] No increase in DeliveryFileImportFunction execution time (< 10% overhead)
- [ ] Application Insights shows zero critical errors for 1 week post-deployment

---

## 16. Appendix

### 16.1 File Format Specifications

#### Data Blob Format
```
CSV format: 7 columns (NO ZIP extraction needed)
Column 0: Item Number (6 characters)
Column 1: Last Seven Day Sale Unit (integer) - NOT STORED
Column 2: Last Seven Day Sale Value (decimal, 2 places) - STORED
Column 3: Future Season End Unit (integer) - NOT STORED
Column 4: Future Season End Value (decimal, 2 places) - NOT STORED
Column 5: Next Season End Unit (integer) - NOT STORED
Column 6: Next Season End Value (decimal, 2 places) - NOT STORED

Stored in TP-Partner as: GUID blob (CSV format)
Retrieved via: GetBlobInformation (source name: data.ItemRank.{timestamp}.zip)

Example:
AA1363,0,0.00,283,6792.00,150,3600.00
AA1400,0,0.00,22,792.00,0,0.00
```

### 16.2 Glossary

| Term | Definition |
|------|------------|
| Item Ranking | Storage account data containing sales metrics per item |
| Last7DaysSalesValue | Total sales value for an item in the last 7 days |
| HotCold Value | Calculated priority score for delivery containers |
| GI/GID | Goods In / Goods In Delivery files |
| Tub/Set | Container types used in delivery process |
| DAL | Data Access Layer |
| TP-Partner Storage | nxdataintprstinsdeveuw storage account |
| GUID Blob | Blob stored with GUID path in container |
| GetBlobInformation | API to retrieve source file metadata from GUID blob |

---