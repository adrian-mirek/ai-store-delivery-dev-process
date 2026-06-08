# Database Implementation Plan: Item Ranking Integration

**Document Version**: 2.0  
**Date**: 2025-12-30  
**Author**: AI Generated, Updated per requirements  
**Status**: Ready for Implementation  
**Change Log**:
- **Date**: 2025-12-29: Removed StoreCode requirement, simplified to item-level only data model

## 1. Scope
Implements a database-backed Item Ranking integration for Hot/Cold value calculations. This plan introduces a table-valued type, a storage table with constraints and index, and stored procedures for upsert and retrieval.

**Key Changes from v1.0**:
- Removed `StoreCode` column from all objects
- Simplified to single record per `ItemNumber`
- Removed store-specific indexes and queries
- Single retrieval method returns all item rankings (no store filtering)

References:
- Feature: .ai/ItemRanking/feature_analysis.md
- User stories: .ai/ItemRanking/user_stories.md

---

## 2. Objects To Create (in order)
1. Schema `delivery` (if not already present)
2. Type `delivery.ItemRankingType`
3. Table `delivery.ItemRanking`
4. Index `delivery.IX_ItemRanking_ItemNumber`
5. Stored procedure `delivery.InsertOrUpdateItemRanking`
6. Stored procedure `delivery.GetItemRanking`

---

## 3. Logical Model
- Single current record per `ItemNumber` (no store-level granularity)
- No history (latest wins) per business requirements
- Optimized for full-table retrieval used by Hot/Cold calculation (in-memory dictionary lookup)
- Simplified data model reduces storage and complexity

---

## 4. DDL Specification

### 4.1 User-Defined Table Type
```sql
CREATE TYPE [delivery].[ItemRankingType] AS TABLE
(
    [ItemNumber]          CHAR(6)      NOT NULL,
    [Last7DaysSalesValue] DECIMAL(9,2) NOT NULL,
    [BlobName]            VARCHAR(40)  NOT NULL
);
```

**Design Notes**:
- Removed `StoreCode` column
- Simplified to 3 columns for batch upsert operations
- `BlobName` used for audit trail of blob name during import

### 4.2 Table
```sql
CREATE TABLE [delivery].[ItemRanking]
(
    [ItemRankingId]       BIGINT IDENTITY(1,1) NOT NULL,
    [ItemNumber]          CHAR(6)              NOT NULL,
    [Last7DaysSalesValue] DECIMAL(9,2)         NOT NULL,
    [ImportTimestamp]     DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME(),
    [BlobName]            VARCHAR(40)          NOT NULL,
    [CreatedAt]           DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME(),
    [UpdatedAt]           DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT [PK_ItemRanking] PRIMARY KEY CLUSTERED ([ItemRankingId]),
    CONSTRAINT [UQ_ItemRanking_ItemNumber] UNIQUE ([ItemNumber])
);
```

**Design Decisions**:
- **Table renamed**: `delivery.ItemRanking` (was `delivery.StoreItemRanking`)
- **Single-record per Item**: UNIQUE constraint on `ItemNumber` ensures only latest ranking persists
- **No StoreCode**: Removed entirely from schema
- **No historical tracking**: Simplifies queries and reduces storage (per requirements)
- **Audit fields**: `ImportTimestamp`, `BlobName`, `CreatedAt`, `UpdatedAt` retained for troubleshooting
- **Primary key**: Surrogate key `ItemRankingId` for flexibility

### 4.3 Nonclustered Index
```sql
CREATE NONCLUSTERED INDEX [IX_ItemRanking_ItemNumber] 
ON [delivery].[ItemRanking] ([ItemNumber])
INCLUDE ([Last7DaysSalesValue]);
```

**Design Notes**:
- **Covering index**: Includes `Last7DaysSalesValue` for query optimization
- **Unique constraint backup**: Supports unique constraint and lookup queries
- **Purpose**: Optimizes dictionary lookup pattern in HotCold calculations

---

## 5. Stored Procedures

### 5.1 Upsert Item Rankings
**Name**: `delivery.InsertOrUpdateItemRanking`  
**Purpose**: Batch upsert from TVP; refreshes `ImportTimestamp` and `UpdatedAt`, sets latest `BlobName`.

```sql
CREATE PROCEDURE [delivery].[InsertOrUpdateItemRanking]
    @Data [delivery].[ItemRankingType] READONLY
AS
BEGIN TRY
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    -- Use temp table for MERGE performance
    DROP TABLE IF EXISTS #ItemRanking;
    CREATE TABLE #ItemRanking
    (
        [ItemNumber]          CHAR(6)      NOT NULL,
        [Last7DaysSalesValue] DECIMAL(9,2) NOT NULL,
        [BlobName]            VARCHAR(40)  NOT NULL
    );

    INSERT INTO #ItemRanking
    SELECT [ItemNumber], [Last7DaysSalesValue], [BlobName]
    FROM @Data;

    -- MERGE on ItemNumber only (no StoreCode)
    MERGE [delivery].[ItemRanking] AS target
    USING #ItemRanking AS source
       ON target.[ItemNumber] = source.[ItemNumber]
    WHEN MATCHED THEN
        UPDATE SET
            target.[Last7DaysSalesValue] = source.[Last7DaysSalesValue],
            target.[BlobName]            = source.[BlobName],
            target.[ImportTimestamp]     = SYSUTCDATETIME(),
            target.[UpdatedAt]           = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT ([ItemNumber], [Last7DaysSalesValue], [BlobName], [ImportTimestamp], [CreatedAt], [UpdatedAt])
        VALUES (source.[ItemNumber], source.[Last7DaysSalesValue], source.[BlobName], SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME());

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRAN;
    THROW;
END CATCH;
```

**Key Changes**:
- Removed `StoreCode` from all operations
- MERGE condition simplified to `ItemNumber` only
- INSERT statement removed `StoreCode` column
- Batch size recommendation: 10,000 rows per call (configurable in application)

**Notes**:
- TVP cardinality hints not required in this pattern
- Transaction ensures atomicity for batch operations
- Error handling with `XACT_ABORT` for clean rollback

### 5.2 Get All Item Rankings
**Name**: `delivery.GetItemRanking`  
**Purpose**: Fast retrieval of all item rankings for Hot/Cold calculation (application builds in-memory dictionary)

```sql
CREATE PROCEDURE [delivery].[GetItemRanking]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        [ItemNumber],
        [Last7DaysSalesValue]
    FROM [delivery].[ItemRanking];
END
```

**Key Changes**:
- **No store parameter**: Removed `@StoreCode` parameter entirely
- **Returns all items**: Application layer builds dictionary for lookups
- **Simplified query**: No WHERE clause, returns full dataset
- **Performance**: Expected dataset size ~50k items, acceptable for in-memory processing

**Usage Pattern**:
```csharp
// Application layer
var itemRankings = await _repository.GetItemRankingAsync();
var itemRankingDict = itemRankings.ToDictionary(ir => ir.ItemNumber, ir => ir.Last7DaysSalesValue);

// Fast lookup in HotCold calculation
foreach (var item in container.Items)
{
    if (itemRankingDict.TryGetValue(item.ItemNumber, out var salesValue))
    {
        container.HotColdValue += (int)salesValue;
    }
}
```

---

## 6. Migration Path (if upgrading from v1.0)

**If `delivery.StoreItemRanking` exists**:

```sql
-- Step 1: Create new objects
-- (Execute sections 4.1, 4.2, 4.3, 5.1, 5.2 above)

-- Step 2: Migrate data (aggregate by ItemNumber, take MAX sales value)
INSERT INTO [delivery].[ItemRanking] 
    ([ItemNumber], [Last7DaysSalesValue], [BlobName], [ImportTimestamp], [CreatedAt], [UpdatedAt])
SELECT 
    [ItemNumber],
    MAX([Last7DaysSalesValue]) AS [Last7DaysSalesValue],
    MAX([BlobName]) AS [BlobName],
    MAX([ImportTimestamp]) AS [ImportTimestamp],
    MIN([CreatedAt]) AS [CreatedAt],
    MAX([UpdatedAt]) AS [UpdatedAt]
FROM [delivery].[StoreItemRanking]
GROUP BY [ItemNumber];

-- Step 3: Verify migration
SELECT 
    (SELECT COUNT(*) FROM [delivery].[StoreItemRanking]) AS OldRowCount,
    (SELECT COUNT(DISTINCT ItemNumber) FROM [delivery].[StoreItemRanking]) AS ExpectedNewRowCount,
    (SELECT COUNT(*) FROM [delivery].[ItemRanking]) AS ActualNewRowCount;

-- Step 4: Drop old objects (after application deployment)
DROP PROCEDURE IF EXISTS [delivery].[GetItemRankingByStoreCode];
DROP INDEX IF EXISTS [IX_StoreItemRanking_StoreCode] ON [delivery].[StoreItemRanking];
DROP TABLE IF EXISTS [delivery].[StoreItemRanking];
-- Note: Keep old ItemRankingType if other objects reference it
```

---

## 7. Test Plan (DB)

### 7.1 Unit Tests
- [ ] **Upsert inserts new rows**: Insert 1000 new item rankings, verify row count
- [ ] **Upsert updates existing rows**: Re-insert same items with different values, verify updates
- [ ] **Unique constraint enforcement**: Attempt duplicate ItemNumber insert, verify error
- [ ] **Transaction rollback**: Force error mid-batch, verify no partial commits
- [ ] **Null handling**: Verify required fields enforce NOT NULL constraints

### 7.2 Performance Tests
- [ ] **Batch insert performance**: 10,000 rows < 2 seconds
- [ ] **Full retrieval performance**: GetItemRanking returns 50,000 rows < 500ms
- [ ] **Index effectiveness**: Verify index seek on ItemNumber queries (execution plan)
- [ ] **Concurrent access**: Multiple simultaneous upserts handle locking correctly

### 7.3 Integration Tests
- [ ] **Application layer integration**: Repository calls succeed with valid data
- [ ] **Error propagation**: Database errors surface to application layer
- [ ] **Blob name tracking**: Verify BlobName updates correctly on re-import

---

## 8. Operational Monitoring

### 8.1 Performance Metrics
- **Row count growth**: Monitor table size (alert if > 100k unexpected items)
- **Query performance**: Track `GetItemRanking` execution time (baseline: < 500ms)
- **Upsert duration**: Track batch insert times (baseline: < 2s per 10k rows)
- **Index fragmentation**: Monitor and rebuild if > 30%

### 8.2 Error Monitoring
- **Deadlocks**: Alert on deadlock occurrences (should be zero with current design)
- **Constraint violations**: Track unique constraint violation attempts
- **Timeout errors**: Alert if upsert or retrieval times out
- **Transaction rollbacks**: Monitor rollback frequency

### 8.3 Alerting Rules
1. **Critical**: No data imports in last 48 hours (check `ImportTimestamp`)
2. **Critical**: `GetItemRanking` failure rate > 1%
3. **Warning**: Row count change > 50% day-over-day
4. **Info**: Index fragmentation > 30%

---

## 9. Rollback Strategy

**If deployment fails**:

```sql
-- Emergency rollback (if needed)
DROP PROCEDURE IF EXISTS [delivery].[GetItemRanking];
DROP PROCEDURE IF EXISTS [delivery].[InsertOrUpdateItemRanking];
DROP INDEX IF EXISTS [IX_ItemRanking_ItemNumber] ON [delivery].[ItemRanking];
DROP TABLE IF EXISTS [delivery].[ItemRanking];
DROP TYPE IF EXISTS [delivery].[ItemRankingType];

-- Restore v1.0 objects if backed up
-- (Application must be rolled back simultaneously)
```

---

## 10. Success Criteria

- [ ] All database objects created successfully in DEV/TEST/PROD
- [ ] Unit tests pass with 100% success rate
- [ ] Performance tests meet baseline targets
- [ ] Application integration tests succeed
- [ ] No errors in SQL Server logs related to new objects
- [ ] Application Insights shows successful database operations

---

## 11. Appendix

### 11.1 SQL Script Execution Order

```sql
-- Script 1: Create Type
-- File: 001_Create_ItemRankingType.sql
CREATE TYPE [delivery].[ItemRankingType] AS TABLE (/* ... */);
GO

-- Script 2: Create Table
-- File: 002_Create_ItemRanking_Table.sql
CREATE TABLE [delivery].[ItemRanking] (/* ... */);
GO

-- Script 3: Create Index
-- File: 003_Create_IX_ItemRanking_ItemNumber.sql
CREATE NONCLUSTERED INDEX [IX_ItemRanking_ItemNumber] /* ... */;
GO

-- Script 4: Create Upsert Proc
-- File: 004_Create_InsertOrUpdateItemRanking_Proc.sql
CREATE PROCEDURE [delivery].[InsertOrUpdateItemRanking] /* ... */;
GO

-- Script 5: Create Retrieval Proc
-- File: 005_Create_GetItemRanking_Proc.sql
CREATE PROCEDURE [delivery].[GetItemRanking] /* ... */;
GO
```

### 11.2 Estimated Storage Requirements

**Assumptions**:
- 50,000 unique items
- Row size: ~80 bytes (6 + 9 + 8 + 20 + 8 + 8 + overhead)
- Index size: ~30 bytes per row

**Calculations**:
- Table data: 50,000 × 80 bytes = ~4 MB
- Index data: 50,000 × 30 bytes = ~1.5 MB
- **Total**: ~6 MB (negligible storage impact)

### 11.3 Glossary

| Term | Definition |
|------|------------|
| **Item-level data** | Data stored per ItemNumber without store-specific granularity |
| **TVP** | Table-Valued Parameter - SQL Server feature for batch operations |
| **MERGE** | SQL statement combining INSERT/UPDATE in single operation |
| **Covering index** | Index including all columns needed for query (avoids table lookup) |
| **Upsert** | Insert or Update - idempotent operation for data synchronization |

---

# Service and API Implementation Plan: Item Ranking Integration

**Document Version**: 2.1  
**Date**: 2025-01-03  
**Author**: AI Generated, Updated per requirements  
**Status**: Ready for Implementation  
**Change Log**:
- **Date**: 2025-12-29: Removed StoreCode requirement, simplified to item-level only data model
- **Date**: 2025-01-03: Replaced FileTimestamp with BlobName for tracking processed blobs

## 1. Scope
Define services, interfaces, data contracts, configuration, and function orchestration to import Item Ranking files from blob storage, persist to DB, and expose data to Hot/Cold calculations.

**Key Changes from v1.0**:
- Removed all branch file processing (no store codes needed)
- Simplified to data file only processing
- Removed `StoreItemRankingModel` class
- Changed repository methods to item-level only (no store parameter)
- Updated HotColdRefreshService to retrieve all items (no store filtering)
- **Replaced FileTimestamp with BlobName for idempotent processing**

References:
- Feature: .ai/ItemRanking/feature_analysis.md
- User stories: .ai/ItemRanking/user_stories.md

---

## 2. Components

### 2.1 Models (Delivery.Processor.API/Models)

**REMOVED Models**:
- ~~`ItemRanking`~~ (replaced by ItemRankingModel)
- ~~`StoreItemRankingModel`~~ (no longer needed - no store codes)
- ~~`ItemRankingFilePair`~~ (no branch file matching needed)

**ACTIVE Models**:

#### ItemRankingModel.cs (UNIFIED MODEL)
```csharp
namespace NextPlc.StoreTech.Delivery.Processor.API.Models
{
    /// <summary>
    /// Unified model for Item Ranking data (database operations and API layer)
    /// </summary>
    public class ItemRankingModel
    {
        public string ItemNumber { get; set; } = string.Empty;
        public decimal Last7DaysSalesValue { get; set; }
        public string BlobName { get; set; } = string.Empty; // GUID blob name for tracking
    }
}
```

**Design Notes**:
- Single model serves all layers (no separate DTO needed)
- `BlobName` populated during import to track which blob was processed
- Maps directly to database table structure

### 2.2 Repository (Delivery.Processor.API/Repositories)

**NEW Repository** (separate from DeliveryDalRepository):

#### IItemRankingRepository.cs
```csharp
namespace NextPlc.StoreTech.Delivery.Processor.API.Repositories.Interfaces
{
    public interface IItemRankingRepository
    {
        /// <summary>
        /// Batch insert/update item rankings using TVP
        /// </summary>
        Task InsertOrUpdateItemRankingAsync(IEnumerable<ItemRankingModel> itemRankings);

        /// <summary>
        /// Retrieve ALL item rankings (no store filtering)
        /// Application layer builds dictionary for lookups
        /// </summary>
        Task<IList<ItemRankingModel>> GetItemRankingAsync();
    }
}
```

#### ItemRankingRepository.cs
```csharp
namespace NextPlc.StoreTech.Delivery.Processor.API.Repositories
{
    public class ItemRankingRepository : IItemRankingRepository
    {
        private readonly IConnectionFactory _connectionFactory;
        private readonly ILogger<ItemRankingRepository> _logger;
        private readonly IDbTransactionHelper _dbTransactionHelper;

        public ItemRankingRepository(
            IConnectionFactory connectionFactory,
            ILogger<ItemRankingRepository> logger,
            IDbTransactionHelper dbTransactionHelper)
        {
            _connectionFactory = connectionFactory;
            _logger = logger;
            _dbTransactionHelper = dbTransactionHelper;
        }

        public async Task InsertOrUpdateItemRankingAsync(IEnumerable<ItemRankingModel> itemRankings)
        {
            // Create DataTable for TVP
            var dataTable = new DataTable();
            dataTable.Columns.Add("ItemNumber", typeof(string));
            dataTable.Columns.Add("Last7DaysSalesValue", typeof(decimal));
            dataTable.Columns.Add("BlobName", typeof(string));

            foreach (var item in itemRankings)
            {
                dataTable.Rows.Add(item.ItemNumber, item.Last7DaysSalesValue, item.BlobName);
            }

            // Execute stored procedure using TVP
            using (var connection = _connectionFactory.CreateConnection())
            {
                await connection.OpenAsync();
                
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = "delivery.InsertOrUpdateItemRanking";
                    command.CommandType = CommandType.StoredProcedure;
                    
                    var parameter = command.Parameters.AddWithValue("@Data", dataTable);
                    parameter.SqlDbType = SqlDbType.Structured;
                    parameter.TypeName = "delivery.ItemRankingType";

                    await _dbTransactionHelper.ExecuteInTransactionAsync(
                        connection,
                        async (transaction) =>
                        {
                            command.Transaction = transaction;
                            await command.ExecuteNonQueryAsync();
                        });
                }
            }
        }

        public async Task<IList<ItemRankingModel>> GetItemRankingAsync()
        {
            var itemRankings = new List<ItemRankingModel>();

            using (var connection = _connectionFactory.CreateConnection())
            {
                await connection.OpenAsync();

                using (var command = connection.CreateCommand())
                {
                    command.CommandText = "delivery.GetItemRanking";
                    command.CommandType = CommandType.StoredProcedure;

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            itemRankings.Add(new ItemRankingModel
                            {
                                ItemNumber = reader.GetString(0),
                                Last7DaysSalesValue = reader.GetDecimal(1)
                                // BlobName not returned by retrieval query
                            });
                        }
                    }
                }
            }

            return itemRankings;
        }
    }
}
```

**Key Changes**:
- **Removed**: `GetItemRankingByStoreCodeAsync(string storeCode)` method
- **Added**: `GetItemRankingAsync()` - returns ALL items (no filtering)
- **Simplified**: DataTable has 3 columns (no StoreCode)
- **Updated**: Column name from FileTimestamp to BlobName

### 2.3 Services

#### IDeliveryItemRankingService.cs
```csharp
namespace NextPlc.StoreTech.Delivery.Processor.API.Interfaces
{
    public interface IDeliveryItemRankingService
    {
        /// <summary>
        /// Process Item Ranking data files from blob storage
        /// </summary>
        Task ProcessItemRankingFilesAsync();
    }
}
```

#### DeliveryItemRankingService.cs (SIMPLIFIED)

**Responsibilities**:
1. Discover blobs in container `deliveryitemranking`
2. For each GUID blob, call `GetBlobInformation` to get `FileName`
3. **Filter for data.ItemRank files ONLY** (ignore branch files if present)
4. Extract GUID blob name for idempotent tracking
5. Parse data blob to extract item ranking CSV data (already extracted, no ZIP)
6. **Build `List<ItemRankingModel>` directly** (no store grouping needed)
7. Batch by 10,000 (configurable) and call repository upsert
8. Move processed blobs to success/failed containers
9. Log telemetry and metrics

**Constructor Dependencies**:
```csharp
private readonly IItemRankingRepository _itemRankingRepository; // NEW repository
private readonly IBlobStorageProcessor _blobStorageProcessor;
private readonly IBlobProcessingClient _blobProcessingClient;
private readonly ILogger<DeliveryItemRankingService> _logger;
private readonly TelemetryClient _telemetryClient;
private readonly IConfiguration _configuration;
```

**Key Methods**:

```csharp
public async Task ProcessItemRankingFilesAsync()
{
    var contextMetrics = new Dictionary<string, object>
    {
        {"LoggingIdentifier", Constants.ItemRankingLoggingIdentifier},
        {"StartedAt", DateTime.UtcNow}
    };

    try
    {
        // Step 1: Get blobs from container
        var containerName = _configuration[Constants.ItemRankingContainerNameKey];
        var blobItems = await GetBlobItemsAsync(containerName);

        _logger.WithContext(contextMetrics).LogInformation(
            $"Found {blobItems.Count} blobs in container {containerName}");

        // Step 2: Process each data.ItemRank blob (no branch file matching)
        foreach (var blobItem in blobItems)
        {
            try
            {
                // Get blob GUID from path
                var blobGuid = blobItem.Name.GetGuildFileName();
                if (string.IsNullOrEmpty(blobGuid)) continue;

                var blobInformation = await GetBlobInformation(blobGuid);
                if (blobInformation == null) continue;

                // Filter for data.ItemRank files only
                if (!blobInformation.FileName.Contains(Constants.ItemRankingDataFilePattern))
                {
                    _logger.LogDebug($"Skipping non-data file: {blobInformation.FileName}");
                    continue;
                }

                // Step 3: Parse data blob (CSV, no ZIP extraction)
                var itemRankings = await ParseDataBlobAsync(blobItem, blobGuid);

                // Step 4: Save to database in batches
                await SaveItemRankingDataAsync(itemRankings);

                // Step 5: Move blob to success container
                await MoveBlobToSuccessContainer(blobItem);

                contextMetrics.Add("FileProcessed", blobInformation.FileName);
                contextMetrics.Add("BlobGuid", blobGuid);
                contextMetrics.Add("RecordsProcessed", itemRankings.Count);
                _logger.WithContext(contextMetrics).LogInformation(
                    CustomEvents.ItemRankingFileProcessed,
                    $"Successfully processed {itemRankings.Count} item rankings from blob {blobGuid}");

                _telemetryClient.TrackMetric("ItemRanking.FilesProcessed", 1);
                _telemetryClient.TrackMetric("ItemRanking.RecordsInserted", itemRankings.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing blob {blobItem.Name}");
                await MoveBlobToFailedContainer(blobItem);
            }
        }
    }
    catch (Exception ex)
    {
        contextMetrics.Add("ErrorType", "ProcessingFailed");
        _logger.WithContext(contextMetrics).LogError(
            CustomEvents.ItemRankingProcessingFailed,
            ex,
            $"Failed to process Item Ranking files");
        throw;
    }
}

private async Task<BlobInformation> GetBlobInformation(string blobGuid)
{
    var blobInformationRequest = new BlobInformationRequest()
    {
        BlobName = blobGuid,
        PartnerCode = _configuration[Constants.EnvironmentNameKey]
    };

    var response = await _blobProcessingClient.GetBlobInformation(
        blobInformationRequest,
        requestOptions: ClientHelper.GetHttpServiceClientRequestOptions());

    if (!response.IsSuccess || response.Result == null)
    {
        _logger.LogWarning($"Failed to get blob information for {blobGuid}");
        return null;
    }

    return new BlobInformation()
    {
        BlobIdentifier = response.Result.BlobIdentifier,
        DistributionType = response.Result.DistributionType,
        DistributionIdentifier = response.Result.DistributionIdentifier,
        FileName = response.Result.FileName
    };
}

private async Task<List<ItemRankingModel>> ParseDataBlobAsync(
    BlobItem blobItem, 
    string blobGuid)
{
    var itemRankings = new List<ItemRankingModel>();

    var blobClient = _blobStorageProcessor.GetBlobClient(blobItem.Name);
    
    // NOTE: Blob is already CSV format (no ZIP extraction)
    using (var stream = await blobClient.OpenReadAsync())
    using (var streamReader = new StreamReader(stream, Encoding.UTF8))
    {
        string line;
        while ((line = await streamReader.ReadLineAsync()) != null)
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
                    // parts[3-6] = Future/Next season data (not stored)
                });
            }
        }
    }

    return itemRankings;
}

private async Task SaveItemRankingDataAsync(List<ItemRankingModel> itemRankings)
{
    var batchSize = _configuration.GetValue<int>(
        Constants.ItemRankingBatchSizeKey, 
        Constants.ItemRankingDefaultBatchSize);

    // Batch processing for memory efficiency
    var batches = itemRankings
        .Select((item, index) => new { item, index })
        .GroupBy(x => x.index / batchSize)
        .Select(g => g.Select(x => x.item).ToList());

    foreach (var batch in batches)
    {
        await _itemRankingRepository.InsertOrUpdateItemRankingAsync(batch);
        
        _logger.LogDebug($"Inserted batch of {batch.Count} item rankings");
    }
}
```

**Key Changes**:
- **Removed**: Branch file parsing methods
- **Removed**: Store code extraction logic
- **Removed**: `BuildStoreItemRankingDictionary` method (no store grouping)
- **Removed**: `ExtractTimestamp` method (no longer needed)
- **Simplified**: Direct list building from CSV data
- **Simplified**: No file pair matching needed
- **Updated**: Use blobGuid directly instead of extracting timestamp

#### HotColdRefreshService.cs (MODIFIED)

**Changes Required**:

```csharp
public class HotColdRefreshService : IRefreshService
{
    private readonly IItemRankingRepository _itemRankingRepository; // NEW dependency
    // ... existing dependencies ...

    // Updated constructor
    public HotColdRefreshService(
        IDeliveryDalRepository deliveryDalRepository,
        IItemRankingRepository itemRankingRepository, // NEW
        IMobileApiClientMock mobileApiClientMock,
        ILogger<HotColdRefreshService> logger,
        TelemetryClient telemetryClient)
    {
        _deliveryDalRepository = deliveryDalRepository;
        _itemRankingRepository = itemRankingRepository; // NEW
        // ... existing assignments ...
    }

    // BEFORE: Method signature with storeCode parameter
    // private async Task<IList<Container>> CalculateValue(string storeCode, IList<Container> containers, bool recalculate)

    // AFTER: Simplified signature (no storeCode parameter)
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

        // NEW: Get ALL item rankings from database (no store filter)
        var itemRankings = await _itemRankingRepository.GetItemRankingAsync();

        if (itemRankings == null || !itemRankings.Any())
        {
            contextMetrics.Add("Status", "NoItemRankingData");
            _logger.WithContext(contextMetrics).LogWarning(
                CustomEvents.HotColdItemRankingDataNotFound,
                $"{Constants.DeliveryDataRefreshLoggingIdentifier}: No Item Ranking data found in database");

            // Continue processing without item ranking data
            // Containers will retain HotColdValue = 0
            return containers;
        }

        // NEW: Build dictionary for fast lookup (replaces LINQ queries)
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
}
```

**Key Changes**:
- **Removed**: `storeCode` parameter from `CalculateValue` method
- **Removed**: Mock API call (`IMobileApiClientMock.GetItemRanking`)
- **Added**: Repository call to `GetItemRankingAsync()` (returns all items)
- **Added**: Dictionary-based lookup for performance (replaces LINQ `.First()` calls)
- **Added**: Warning log when no item ranking data found (non-blocking)

### 2.4 Configuration

#### local.settings.json
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

**Key Changes**:
- **Removed**: `ItemRanking:FilePattern:Branch` (not needed)

#### Constants.ItemRanking.cs
```csharp
namespace NextPlc.StoreTech.Delivery.Processor.API.Helpers
{
    public partial class Constants
    {
        // Logging
        public static readonly string ItemRankingLoggingIdentifier = "ItemRankingImport";

        // File Patterns
        public static readonly string ItemRankingDataFilePattern = "data.ItemRank";

        // Configuration Keys
        public static readonly string ItemRankingStorageConnectionKey = "ItemRanking:Storage:ConnectionString";
        public static readonly string ItemRankingContainerNameKey = "ItemRanking:Storage:ContainerName";
        public static readonly string ItemRankingSuccessContainerKey = "ItemRanking:Storage:SuccessContainer";
        public static readonly string ItemRankingFailedContainerKey = "ItemRanking:Storage:FailedContainer";
        public static readonly string ItemRankingBatchSizeKey = "ItemRanking:BatchSize";

        // Defaults
        public const int ItemRankingDefaultBatchSize = 10000;
    }
}
```

**Key Changes**:
- **Removed**: `ItemRankingBranchFilePattern` constant
- **Removed**: `ItemRankingTimestampPattern` constant (no longer needed)

### 2.5 Telemetry

#### CustomEvents.cs (ADDITIONS)
```csharp
public static class CustomEvents
{
    public static class ItemRankingImport
    {
        public const string FileProcessed = "ItemRankingImport.FileProcessed";
        public const string RecordsInserted = "ItemRankingImport.RecordsInserted";
        public const string ProcessingTime = "ItemRankingImport.ProcessingTime";
        public const string GetBlobInformationFailed = "ItemRankingImport.GetBlobInformationFailed";
        public const string ProcessingFailed = "ItemRankingImport.ProcessingFailed";
    }

    public static class HotCold
    {
        public const string ItemRankingDataNotFound = "HotCold.ItemRankingDataNotFound";
    }
}
```

**Metrics**:
```csharp
_telemetryClient.TrackMetric("ItemRanking.FilesProcessed", 1);
_telemetryClient.TrackMetric("ItemRanking.RecordsInserted", itemRankings.Count);
_telemetryClient.TrackMetric("ItemRanking.ProcessingDuration", stopwatch.ElapsedMilliseconds);
```

**Key Changes**:
- **Removed**: `ItemRankingImport.FileMatchingIncomplete` (no file matching)
- **Removed**: `ItemRankingImport.FilesMatched` (no file matching)

---

## 3. Integration Points

### 3.1 DeliveryFileImportFunction (MODIFIED)

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

### 3.2 Program.cs (Dependency Injection)

```csharp
// NEW registrations
services.AddScoped<IItemRankingRepository, ItemRankingRepository>();
services.AddScoped<IDeliveryItemRankingService, DeliveryItemRankingService>();

// Existing registrations remain unchanged
services.AddScoped<IDeliveryDalRepository, DeliveryDalRepository>();
services.AddScoped<IHotColdRefreshService, HotColdRefreshService>();
// ... etc.
```

---

## 4. Error Handling & Retries

### 4.1 GetBlobInformation Errors
**Scenario**: API call fails or returns no data

**Handling**:
```csharp
try
{
    var blobInfo = await GetBlobInformation(blobGuid);
    if (blobInfo == null)
    {
        _logger.LogWarning($"No blob information returned for {blobGuid}");
        continue; // Skip this blob, continue with next
    }
}
catch (Exception ex)
{
    contextMetrics.Add("ErrorType", "GetBlobInformationFailed");
    _logger.WithContext(contextMetrics).LogError(
        CustomEvents.ItemRankingGetBlobInformationFailed,
        ex,
        $"Failed to get blob information for GUID {blobGuid}");

    // Skip this blob, continue with next
    continue;
}
```

### 4.2 Database Insert Errors
**Scenario**: Database connection failure or constraint violation

**Handling**:
```csharp
try
{
    await _itemRankingRepository.InsertOrUpdateItemRankingAsync(batch);

    contextMetrics.Add("RecordsInserted", batch.Count);
    _logger.WithContext(contextMetrics).LogInformation(
        CustomEvents.ItemRankingRecordsInserted,
        $"Inserted {batch.Count} item ranking records");
}
catch (Exception ex)
{
    contextMetrics.Add("ErrorType", "DatabaseInsertFailed");
    _logger.WithContext(contextMetrics).LogError(
        CustomEvents.ItemRankingProcessingFailed,
        ex,
        $"Failed to insert item ranking data");

    // Move blob to failed container
    await MoveBlobToFailedContainer(blobItem);

    throw; // Re-throw to fail the function run
}
```

### 4.3 HotCold Calculation Errors
**Scenario**: No item ranking data available

**Handling**:
```csharp
var itemRankings = await _itemRankingRepository.GetItemRankingAsync();

if (itemRankings == null || !itemRankings.Any())
{
    contextMetrics.Add("Status", "NoItemRankingData");

    _logger.WithContext(contextMetrics).LogWarning(
        CustomEvents.HotColdItemRankingDataNotFound,
        $"No Item Ranking data found in database. HotCold values will remain at 0.");

    // Continue processing without item ranking data
    // Containers will retain HotColdValue = 0
    return containers;
}
```

---

## 5. Testing Plan

### 5.1 Unit Tests

**File**: `Delivery.Processor.API.Tests\Services\DeliveryItemRankingServiceTests.cs`

**Test Cases**:
```csharp
[TestClass]
public class DeliveryItemRankingServiceTests
{
    [TestMethod]
    public async Task GetBlobInformation_ValidGuid_ReturnsBlobInfo() { }

    [TestMethod]
    public async Task ParseDataBlob_ValidCSV_ReturnsItemRankings() { }

    [TestMethod]
    public void ExtractBlobGuid_ValidBlobPath_ReturnsGuid() { }

    [TestMethod]
    public void ExtractBlobGuid_InvalidPath_ReturnsNull() { }

    [TestMethod]
    public async Task ProcessFiles_DatabaseError_MovesToFailedContainer() { }

    [TestMethod]
    public async Task ProcessFiles_ValidData_InsertsToDatabase() { }

    [TestMethod]
    public async Task ProcessFiles_SkipsBranchFiles() { } // NEW TEST
}
```

**File**: `Delivery.Processor.API.Tests\Repositories\ItemRankingRepositoryTests.cs`

**Test Cases**:
```csharp
[TestClass]
public class ItemRankingRepositoryTests
{
    [TestMethod]
    public async Task InsertOrUpdateItemRankingAsync_NewItems_InsertsSuccessfully() { }

    [TestMethod]
    public async Task InsertOrUpdateItemRankingAsync_ExistingItems_UpdatesSuccessfully() { }

    [TestMethod]
    public async Task GetItemRankingAsync_ReturnsAllItems() { } // NEW TEST

    [TestMethod]
    public async Task InsertOrUpdateItemRankingAsync_DuplicateItemNumber_ThrowsException() { }
}
```

**File**: `Delivery.Processor.API.Tests\Services\HotColdRefreshServiceTests.cs`

**Test Cases**:
```csharp
[TestClass]
public class HotColdRefreshServiceTests
{
    [TestMethod]
    public async Task CalculateValue_WithItemRankings_CalculatesCorrectly() { }

    [TestMethod]
    public async Task CalculateValue_NoItemRankings_LeavesHotColdValueZero() { } // NEW TEST

    [TestMethod]
    public async Task CalculateValue_UsesDictionaryLookup_PerformanceTest() { } // NEW TEST
}
```

### 5.2 Integration Tests

**File**: `Delivery.Processor.API.IntegrationTest\ItemRankingImportIntegrationTest.cs`

**Test Cases**:
```csharp
[TestClass]
public class ItemRankingImportIntegrationTest
{
    [TestMethod]
    public async Task ProcessItemRankingFiles_EndToEnd_InsertsToDatabase() { }

    [TestMethod]
    public async Task HotColdCalculation_WithItemRanking_CalculatesCorrectValues() { }

    [TestMethod]
    public async Task ProcessFiles_DuplicateTimestamp_UpdatesExistingRecords() { }

    [TestMethod]
    public async Task GetItemRanking_NoData_ReturnsEmptyList() { }

    [TestMethod]
    public async Task ProcessFiles_IgnoresBranchFiles() { } // NEW TEST
}
```

### 5.3 Test Data

**Data Blob** (GUID: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, Source: `data.ItemRank.2512140047162.zip`, CSV format):
```
AA1363,0,0.00,283,6792.00,150,3600.00
AA1400,0,0.00,22,792.00,0,0.00
BB2501,15,450.50,100,3000.00,50,1500.00
```

**Expected Database Records**:
```sql
SELECT * FROM delivery.ItemRanking;
-- AA1363 | 0.00   | a1b2c3d4-e5f6-7890-abcd-ef1234567890
-- AA1400 | 0.00   | a1b2c3d4-e5f6-7890-abcd-ef1234567890
-- BB2501 | 450.50 | a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

## 6. Performance Considerations

### 6.1 Dictionary Lookup Optimization

**BEFORE (LINQ - Slow)**:
```csharp
foreach (var item in container.Items)
{
    if (itemRankings.All(j => j.ItemNumber != item.ItemNumber))
        continue;

    container.HotColdValue += (int)itemRankings.First(j => j.ItemNumber == i.ItemNumber)?.Last7DaysSalesValue;
}
```

**AFTER (Dictionary - Fast)**:
```csharp
var itemRankingDict = itemRankings.ToDictionary(ir => ir.ItemNumber, ir => ir.Last7DaysSalesValue);

foreach (var item in container.Items)
{
    if (itemRankingDict.TryGetValue(item.ItemNumber, out var salesValue))
    {
        container.HotColdValue += (int)salesValue;
    }
}
```

**Performance Gain**: O(n²) → O(n) complexity

### 6.2 Batch Size Tuning

**Recommended Batch Sizes**:
- **Development**: 1,000 rows (fast feedback)
- **Production**: 10,000 rows (memory vs. transaction balance)
- **Large files**: 5,000 rows (if memory constraints)

---

## 7. Deployment Checklist

### 7.1 Database Deployment
- [ ] Deploy database objects (see database implementation plan)
- [ ] Verify stored procedures created successfully
- [ ] Run database unit tests

### 7.2 Application Deployment
- [ ] Deploy ItemRankingModel class (BlobName property instead of FileTimestamp)
- [ ] Deploy IItemRankingRepository and ItemRankingRepository
- [ ] Deploy IDeliveryItemRankingService and DeliveryItemRankingService
- [ ] Update Constants.ItemRanking (removed timestamp pattern)
- [ ] Deploy CustomEvents additions
- [ ] Update HotColdRefreshService
- [ ] Update DeliveryFileImportFunction
- [ ] Update Program.cs (DI registrations)
- [ ] Update local.settings.json / Azure App Configuration
- [ ] **DELETE**: StoreItemRankingModel.cs
- [ ] **DELETE**: ItemRankingFilePair.cs

### 7.3 Testing & Validation
- [ ] Run unit tests (all pass)
- [ ] Run integration tests (all pass)
- [ ] Verify DEV environment import success
- [ ] Monitor Application Insights for errors
- [ ] Validate HotCold calculations match expected results

### 7.4 Production Deployment
- [ ] Deploy to TEST environment
- [ ] Verify 1 week of successful imports in TEST
- [ ] Deploy to PROD environment
- [ ] Monitor for 48 hours post-deployment
- [ ] Create Application Insights dashboard

---

## 8. Success Criteria

- [ ] Item Ranking files automatically imported from storage account
- [ ] GUID blobs processed with GetBlobInformation API
- [ ] Data persisted to `delivery.ItemRanking` table (no StoreCode)
- [ ] HotCold calculations use database values instead of mock
- [ ] All operations logged to Application Insights
- [ ] Import completes within 5 minutes for typical file sizes
- [ ] Database queries complete within 500ms
- [ ] Zero data loss during file processing
- [ ] 99.9% import success rate over 30-day period

---

## 9. Non-Functional Requirements

- .NET 8
- Batching for memory efficiency
- Idempotent processing by timestamp and unique constraint
- Observability via Application Insights events and metrics
- Dictionary-based lookups for performance (O(n) vs O(n²))

---
