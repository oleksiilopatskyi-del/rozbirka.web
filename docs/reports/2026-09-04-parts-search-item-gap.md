# Запит до core: `PartSearchItemDto` для екрана «Деталі»

> **Виконано.** Core додав `QuantityAvailable`, `QuantityReserved`, `Car` і
> фільтр `CarIds`; веб перевів екран «Деталі» на `POST /parts/search` та
> `POST /parts/search/facets`. Документ лишається як опис домовленості.

- Дата: 2026-09-04
- Автор: web (ROZ-104)
- Сервіс: `rozbirka.core`
- Контракт: `src/api/generated/core.ts` (згенеровано з OpenAPI core)

## Коротко

Бічна панель фільтрів на `/app/:tenant/parts` вже повністю покрита контрактом —
`POST /api/v1/parts/search` і `POST /api/v1/parts/search/facets` дають і фільтри,
і лічильники по кожному виміру. Бракує одного: **`PartSearchItemDto` не несе
полів, які показує таблиця цього ж екрана**, тож перейти на пошук зараз означає
втратити три колонки.

Прохання: додати їх у `PartSearchItemDto`. Це єдина зміна, потрібна вебу, щоб
екран став таким, як у макеті.

## Що вже є і працює

`PartSearchRequest` покриває всю панель фільтрів:

| Група в макеті | Поле запиту                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Статус         | `statuses[]`                                                                                                 |
| Сумісність     | `compatibility.makeIds[]`, `compatibility.modelIds[]`, `compatibility.generationIds[]`, `compatibility.year` |
| Розміщення     | `warehouseIds[]`, `zoneIds[]`                                                                                |
| Стан деталі    | `conditions[]` (`good` / `fair` / `scrap` / `new` / `refurbished`)                                           |
| Походження     | `originTypes[]` (`car` / `batch` / `free`)                                                                   |
| Пошук          | `query`                                                                                                      |
| Сортування     | `sort`                                                                                                       |

`PartFacetResponse` дає лічильники поруч із кожним значенням: `statuses`,
`conditions`, `origins`, `makes`, `models`, `warehouses`, `zones`,
`equipmentTypes`, `generations`, `qualityFlags`, `inventoryLocks`,
`discrepancies` — саме ті числа, що намальовані в макеті (`good 812` тощо).

## Чого бракує

Таблиця на екрані показує колонки **Авто-джерело**, **Стан** (статус),
**Доступно**, **Резерв**. `PartSearchItemDto` натомість несе:

```
condition, createdAt, hasDiscrepancy, id, isInventoryLocked,
name, oemCode, quantity, sourceType, thumbnailUrl, unit
```

Тобто немає:

| Колонка      | Потрібне поле                            | Є в                              |
| ------------ | ---------------------------------------- | -------------------------------- |
| Стан         | `status` (`available`/`reserved`/`sold`) | `PartListItemDto` (`GET /parts`) |
| Доступно     | `quantityAvailable`                      | `PartListItemDto`                |
| Резерв       | `quantityReserved`                       | `PartListItemDto`                |
| Авто-джерело | `car { id, make, model, year }`          | `PartListItemDto`                |

`sourceType` каже лише «з авто / з партії / вільна», але не яке саме авто, тому
колонку «Авто-джерело» з нього не скласти.

## Прохання

Додати до `PartSearchItemDto` чотири поля з `PartListItemDto`:

```csharp
public string Status { get; init; }              // available | reserved | sold
public int QuantityAvailable { get; init; }
public int QuantityReserved { get; init; }
public PartCarDto? Car { get; init; }            // id, make, model, year, vin
```

Дані вже рахуються для `GET /api/v1/parts` (`PartService`), тож ідеться про
перенесення тієї самої проєкції в пошуковий запит, а не про нову логіку.

## Що робить веб після цього

Один екран, один запит: `POST /parts/search` для рядків і
`POST /parts/search/facets` для лічильників панелі. Легасі `GET /api/v1/parts`
лишається для мобільного застосунку й наших посилань `?car_ids=` доти, доки
`carIds` не з'явиться в `PartSearchRequest` (окреме, не блокуюче прохання).

## Альтернатива, якщо DTO змінювати не хочемо

Веб переходить на пошук як є і показує в таблиці те, що приходить: назва + OEM,
стан деталі, походження, кількість. Тоді панель фільтрів працює повністю, але
таблиця втрачає статус, розбивку доступно/резерв і авто-джерело — тобто три
колонки, за якими на складі шукають щодня. Тому просимо перший варіант.

## Посилання

- Контракт: `PartSearchRequest`, `PartSearchItemDto`, `PartFacetResponse` у
  `rozbirka.web:src/api/generated/core.ts`
- Екран: `rozbirka.web:src/cabinet/parts/PartsScreen.tsx`
- Поточний список: `rozbirka.core:src/Rozbirka.API/Controllers/PartsController.cs`
  (`GET /parts`), `rozbirka.core:src/Rozbirka.Application/Parts/PartService.cs`
