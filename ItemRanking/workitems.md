# User Story 1: Item Ranking Integration for Delivery System

## 1. Title
Item Ranking Integration for Delivery System - Database-Driven Hot/Cold Value Calculations (Item-Level Only)

## 2. Description
Integrate Item Ranking data from storage account files into the Delivery system to support Hot/Cold value calculations for tubs/sets. This replaces the current mock-based approach with a database-driven implementation that imports, stores, and retrieves Last7DaysSalesValue data **at the item level only** (no store-specific data) from storage account files, processes them through the Delivery Processor, stores them in the database, and uses them for accurate Hot/Cold calculations based on real sales data.

**Change Log**: 
- 2025-12-29: Removed StoreCode requirement, simplified to item-level only data model
- 2025-01-03: Replaced FileTimestamp with BlobName for tracking processed blobs

## 3. Development Tasks

### Task 1: Database Schema Implementation
- Create User-Defined Type `delivery.ItemRankingType` with columns: ItemNumber (CHAR(6)), Last7DaysSalesValue (DECIMAL(9,2)), BlobName (VARCHAR(40))
- Create table `delivery.ItemRanking` with columns:
  - ItemRankingId (BIGINT IDENTITY PRIMARY KEY)
  - ItemNumber (CHAR(6) NOT NULL)
  - Last7DaysSalesValue (DECIMAL(9,2) NOT NULL)
  - ImportTimestamp (DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())
  - BlobName (VARCHAR(40) NOT NULL)
  - CreatedAt (DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())
  - UpdatedAt (DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())
- Add UNIQUE constraint on ItemNumber
- Create NONCLUSTERED INDEX `IX_ItemRanking_ItemNumber` on ItemNumber with INCLUDE columns (Last7DaysSalesValue)
- Create stored procedure `delivery.InsertOrUpdateItemRanking` accepting `@Data [delivery].[ItemRankingType] READONLY` parameter
- Create stored procedure `delivery.GetItemRanking` (no store code parameter)

### Task 2: Data Integration Platform Configuration
- Add file map record to `DataIntgeration.Data.API\Constants\DevelopmentSetupData.cs`:
  - `data.ItemRank%.zip` → container: `deliveryitemranking`, HasRestrictedData: false
  - `trigger.ItemRank%.trigger` → container: `deliveryitemranking`, HasRestrictedData: false
- **Note**: branch.ItemRank file mapping NOT required for this solution

### Task 3: Model Classes Implementation
- Create `Models\ItemRankingModel.cs` (unified model for database operations and repository) with properties:
  - ItemNumber (string)
  - Last7DaysSalesValue (decimal)
  - BlobName (string) - GUID blob name for tracking
- **Removed Models**:
  - ~~StoreItemRankingModel~~ (no store code needed)
  - ~~ItemRankingFilePair~~ (no branch file matching needed)

### Task 4: Repository Implementation
- Create new repository `ItemRankingRepository.cs` implementing `IItemRankingRepository`:
  - Method `InsertOrUpdateItemRankingAsync(List<ItemRankingModel> itemRankings)`:
    - Create DataTable from ItemRankingModel list
    - Execute stored procedure `delivery.InsertOrUpdateItemRanking` with table-valued parameter
    - Implement transaction handling with rollback on error
  - Method `GetItemRankingAsync()`:
    - Execute stored procedure `delivery.GetItemRanking`
    - Return List<ItemRankingModel> (no store filter)

### Task 5: DeliveryItemRankingService Implementation
- Create `Services\DeliveryItemRankingService.cs` implementing `IDeliveryItemRankingService`
- Inject dependencies: IItemRankingRepository, IBlobStorageProcessor, IBlobProcessingClient, ILogger, TelemetryClient, IConfiguration
- Implement `ProcessItemRankingFilesAsync()` method:
  - Get blob items from `deliveryitemranking` container using BlobStorageProcessor
  - For each blob GUID, call `GetBlobInformation(blobGuid)` to retrieve source file name
  - Filter for data.ItemRank files only (ignore branch files if present)
  - Extract GUID blob name for idempotent tracking
  - Parse data blob to extract item ranking CSV data (already extracted, no ZIP)
  - Build list of ItemRankingModel (no store grouping)
  - Batch insert to database (10k records per batch) via repository
  - Move processed blobs to success/failed containers
  - Handle errors with Application Insights logging
- Implement private method `GetBlobInformation(string blobGuid)`:
  - Create BlobInformationRequest with BlobName and PartnerCode
  - Call IBlobProcessingClient.GetBlobInformation
  - Return BlobInformation with FileName property
- Implement private method `ParseDataBlobAsync(BlobClient dataBlobClient, string blobGuid)`:
  - Open blob stream (CSV format, no ZIP extraction)
  - Parse CSV lines: ItemNumber,Last7DaysSaleUnit,Last7DaysSalesValue,FutureSeasonEndUnit,FutureSeasonEndValue,NextSeasonEndUnit,NextSeasonEndValue
  - Create ItemRankingModel objects with ItemNumber (parts[0]), Last7DaysSalesValue (parts[2]), and BlobName (blobGuid)
  - Return List<ItemRankingModel>
- Implement private method `SaveItemRankingDataAsync(List<ItemRankingModel> itemRankings)`:
  - Batch into 10k record chunks
  - Call repository.InsertOrUpdateItemRankingAsync for each batch
  - Log success metrics to Application Insights

### Task 6: Configuration Updates
- Add configuration entries to `local.settings.json`:
  - ItemRanking:Storage:ConnectionString
  - ItemRanking:Storage:ContainerName = "deliveryitemranking"
  - ItemRanking:Storage:SuccessContainer = "itemranking-success"
  - ItemRanking:Storage:FailedContainer = "itemranking-failed"
  - ItemRanking:FilePattern:Data = "data.ItemRank"
  - ItemRanking:BatchSize = "10000"
- Create `Helpers\Constants.ItemRanking.cs` with constants:
  - LoggingIdentifier = "ItemRankingImport"
  - DataFilePattern = "data.ItemRank"
  - DefaultBatchSize = 10000

### Task 7: DeliveryFileImportFunction Integration
- Add IDeliveryItemRankingService parameter to constructor of `DeliveryFileImportFunction.cs`
- Update `Run` method execution sequence:
  - Step 1: `await _itemRankingService.ProcessItemRankingFilesAsync()`
  - Step 2: `await _deliveryProcessor.ProcessBlobData(_configuration[Constants.DeliveryFileTagKey])`
  - Step 3: `await _combinedRefreshService.FillInDbDataFromService()`
- Add error handling to ensure Item Ranking import errors don't block GI/GID processing
- Add execution logging with timestamps

### Task 8: HotColdRefreshService Modification
- Replace `IMobileApiClientMock.GetItemRanking()` call with `await _itemRankingRepository.GetItemRankingAsync()` (no store filter)
- Convert List<ItemRankingModel> to Dictionary<string, decimal> for performance (key: ItemNumber, value: Last7DaysSalesValue)
- Replace LINQ queries with Dictionary.TryGetValue() lookups in container/item iteration
- Add warning logging if no item ranking data found (containers retain HotColdValue=0)
- **Note**: No storeCode parameter needed - method signature remains compatible with existing calls
- Add contextMetrics logging for Item Ranking data retrieval

### Task 9: Dependency Injection Registration
- Register IDeliveryItemRankingService and DeliveryItemRankingService in `Program.cs`
- Register IItemRankingRepository and ItemRankingRepository in `Program.cs`
- Register services as Scoped lifetime

### Task 10: Application Insights Instrumentation
- Add custom events:
  - ItemRankingImport.FileProcessed
  - ItemRankingImport.RecordsInserted
  - ItemRankingImport.ProcessingTime
  - ItemRankingImport.GetBlobInformationFailed
  - HotCold.ItemRankingDataNotFound
- Add custom metrics tracking:
  - ItemRanking.FilesProcessed
  - ItemRanking.RecordsInserted
  - ItemRanking.ProcessingDuration
- Implement contextMetrics pattern for structured logging

## 4. Testing Scenarios

### Unit Tests (DeliveryItemRankingServiceTests.cs)
- Test `GetBlobInformation_ValidGuid_ReturnsBlobInfo`: Verify API call returns correct source file name
- Test `ParseDataBlob_ValidCSV_ReturnsItemRankings`: Verify CSV parsing creates ItemRankingModel objects with correct ItemNumber and Last7DaysSalesValue
- Test `ExtractBlobGuid_ValidBlobPath_ReturnsGuid`: Verify GUID extraction from blob path
- Test `ExtractBlobGuid_InvalidPath_ReturnsNull`: Verify null returned for invalid paths
- Test `ProcessFiles_DatabaseError_MovesToFailedContainer`: Verify error handling moves blobs to failed container
- Test `ProcessFiles_ValidData_InsertsToDatabase`: Verify successful database insertion

### Repository Tests (ItemRankingRepositoryTests.cs)
- Test `InsertOrUpdateItemRankingAsync_NewRecords_InsertsSuccessfully`: Verify MERGE inserts new records
- Test `InsertOrUpdateItemRankingAsync_ExistingRecords_UpdatesSuccessfully`: Verify MERGE updates existing records
- Test `InsertOrUpdateItemRankingAsync_DatabaseError_RollsBackTransaction`: Verify transaction rollback on error
- Test `GetItemRankingAsync_ValidData_ReturnsData`: Verify stored procedure returns all item rankings
- Test `GetItemRankingAsync_NoData_ReturnsEmpty`: Verify empty list returned when no data exists

### HotColdRefreshService Tests (HotColdRefreshServiceTests.cs)
- Test `CalculateValue_WithItemRankingData_CalculatesCorrectly`: Verify HotColdValue calculation using database data
- Test `CalculateValue_NoItemRankingData_LogsWarning`: Verify warning logged when no data found
- Test `CalculateValue_DatabaseResults_MatchMockResults`: Verify calculation results match previous mock-based approach
- Test `CalculateValue_DictionaryLookup_PerformsEfficiently`: Verify dictionary lookup performance vs LINQ

### Integration Tests (ItemRankingImportIntegrationTest.cs)
- Test `ProcessItemRankingFiles_EndToEnd_InsertsToDatabase`:
  - Upload test files to Data Integration storage
  - Verify files transferred to TP-Partner deliveryitemranking container as GUID blobs
  - Trigger DeliveryFileImportFunction
  - Verify GetBlobInformation retrieves correct source file names
  - Verify database contains expected records
  - Verify BlobName matches blob GUID
- Test `HotColdCalculation_WithItemRanking_CalculatesCorrectValues`:
  - Insert test item ranking data
  - Process GI/GID files
  - Run HotColdRefreshService
  - Verify HotColdValue matches expected calculation
- Test `ProcessFiles_DuplicateBlob_UpdatesExistingRecords`:
  - Insert initial item ranking data
  - Upload files with same blob GUID but different values
  - Trigger DeliveryFileImportFunction
  - Verify records updated (not duplicated)

### Monitoring/Alerting Validation
- Test Application Insights custom events are logged
- Test custom metrics are tracked
- Test contextMetrics pattern produces structured logs
- Verify alert configuration for:
  - No imports in 48 hours (Critical)
  - Database insert failures > 5% (Warning)
  - HotCold calculation with no item ranking data (Info)

## 5. Acceptance Criteria

- As a **Data Integration Platform**, I want to configure file mapping for Item Ranking data file so that it is automatically transferred to the deliveryitemranking container in TP-Partner storage as GUID blobs with file transfer logged in Application Insights.
  - [ ] File map record added for data.ItemRank (no branch.ItemRank)
  - [ ] Files transferred to `deliveryitemranking` container as GUID blobs
  - [ ] File transfer logged in Application Insights

- As a **Delivery Database**, I want to store Item Ranking data at the item level so that HotCold calculations can query real sales data with a unique constraint on ItemNumber, an optimized index for item-based queries, and stored procedures for insert/update and retrieval operations.
  - [ ] Table `delivery.ItemRanking` created (no StoreCode column)
  - [ ] Unique constraint on ItemNumber
  - [ ] Index optimized for item-based queries
  - [ ] User-defined type `delivery.ItemRankingType` created
  - [ ] Stored procedures created
  - [ ] BlobName column for tracking processed blobs

- As a **Delivery Processor**, I want to import Item Ranking files from TP-Partner blob storage so that item ranking data is available in the database by reading GUID blobs from the deliveryitemranking container, calling GetBlobInformation API to retrieve source file names, filtering for data.ItemRank files only, parsing data blob correctly (CSV format, no ZIP extraction), building list of ItemRankingModel (no store grouping), executing batch inserts via repository (10k records per batch), moving processed blobs to success/failed containers, and logging all operations to Application Insights.
  - [ ] DeliveryItemRankingService implemented
  - [ ] GetBlobInformation API integration working
  - [ ] Only data.ItemRank files processed
  - [ ] CSV parsing correct
  - [ ] Batch inserts working
  - [ ] Blob movement to success/failed containers
  - [ ] BlobName tracked for idempotency

- As an **ItemRankingRepository**, I want to provide methods for inserting and querying Item Ranking data so that services can persist and retrieve sales data using the `InsertOrUpdateItemRankingAsync` and `GetItemRankingAsync` methods that use stored procedures, implement error handling with transaction rollback, and pass unit tests.
  - [ ] `InsertOrUpdateItemRankingAsync` method implemented
  - [ ] `GetItemRankingAsync` method implemented (no store filter)
  - [ ] Stored procedures used
  - [ ] Error handling with transaction rollback
  - [ ] Unit tests passing
  - [ ] BlobName parameter included in TVP

- As a **DeliveryFileImportFunction**, I want to process Item Ranking files before GI/GID files so that item ranking data is available for HotCold calculations with IDeliveryItemRankingService injected into constructor, ProcessItemRankingFilesAsync called before ProcessBlobData, execution sequence of ItemRanking → GI/GID → HotCold maintained, errors in ItemRanking import not blocking GI/GID processing, and execution logged with timestamps.
  - [ ] IDeliveryItemRankingService injected
  - [ ] ProcessItemRankingFilesAsync called first
  - [ ] Execution sequence maintained
  - [ ] Error isolation working
  - [ ] Logging in place

- As a **HotColdRefreshService**, I want to retrieve Last7DaysSalesValue from the database so that HotCold calculations use real sales data by removing IMobileApiClientMock.GetItemRanking from CalculateValue, calling repository method GetItemRankingAsync instead (no store filter), using Dictionary lookup instead of LINQ queries for performance, logging warnings if no item ranking data is found (containers retain HotColdValue=0), ensuring calculation results match mock-based results during validation phase, and updating unit tests to use repository mock.
  - [ ] IMobileApiClientMock.GetItemRanking removed
  - [ ] Repository method GetItemRankingAsync called (no store filter)
  - [ ] Dictionary lookup implemented
  - [ ] Warning logging for no data
  - [ ] Calculation results validated
  - [ ] Unit tests updated
  - [ ] Method signature remains compatible (no storeCode parameter)

- As a **QA Engineer**, I want to test the complete Item Ranking flow so that I can verify data accuracy and system reliability through integration tests that upload test files to Data Integration storage, verify files transferred to TP-Partner deliveryitemranking as GUID blobs, trigger DeliveryFileImportFunction, verify GetBlobInformation retrieves correct source file names, verify database inserts with expected data, verify HotCold calculations use database values, and validate duplicate file handling (updates existing records).
  - [ ] End-to-end integration test passing
  - [ ] File transfer verified
  - [ ] GetBlobInformation working
  - [ ] Database inserts verified
  - [ ] HotCold calculations verified
  - [ ] Duplicate file handling verified
  - [ ] BlobName column populated correctly

- As a **DevOps Engineer**, I want to monitor Item Ranking import health so that I can detect and resolve issues proactively with Application Insights custom events configured, custom metrics tracked (files processed, records inserted, duration), alerts created for no imports in 48 hours, alerts created for database insert failures > 5%, and dashboards created showing import metrics and trends.
  - [ ] Application Insights events configured
  - [ ] Custom metrics tracked
  - [ ] Alerts created (no imports, insert failures)
  - [ ] Dashboard created
