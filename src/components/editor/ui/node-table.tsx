import {
  BlockSelectionPlugin,
  useBlockSelected,
} from '@platejs/selection/react'
import {
  TablePlugin,
  TableProvider,
  useTableCellElement,
  useTableCellElementResizable,
  useTableElement,
  useTableMergeState,
} from '@platejs/table/react'
import { PopoverAnchor } from '@radix-ui/react-popover'
import { cva } from 'class-variance-authority'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CombineIcon,
  SquareSplitHorizontalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import {
  KEYS,
  type TTableCellElement,
  type TTableElement,
  type TTableRowElement,
} from 'platejs'
import {
  PlateElement,
  type PlateElementProps,
  useEditorPlugin,
  useEditorSelector,
  useElement,
  useElementSelector,
  useFocusedLast,
  usePluginOption,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
  withHOC,
} from 'platejs/react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent } from '@/ui/popover'
import { blockSelectionVariants } from './block-selection'
import { ResizeHandle } from './resize-handle'
import { Toolbar, ToolbarButton, ToolbarGroup } from './toolbar'

export const TableElement = withHOC(
  TableProvider,
  function TableElement({
    children,
    ...props
  }: PlateElementProps<TTableElement>) {
    const readOnly = useReadOnly()
    const isSelectionAreaVisible = usePluginOption(
      BlockSelectionPlugin,
      'isSelectionAreaVisible'
    )
    const hasControls = !readOnly && !isSelectionAreaVisible
    const { isSelectingCell, marginLeft, props: tableProps } = useTableElement()

    const isSelectingTable = useBlockSelected(props.element.id as string)

    const content = (
      <PlateElement
        {...props}
        className={cn(
          'overflow-x-auto py-5',
          hasControls && '-ml-2 *:data-[slot=block-selection]:left-2'
        )}
        style={{ paddingLeft: marginLeft }}
      >
        <div className="group/table relative w-fit">
          <table
            className={cn(
              'mr-0 ml-px table h-px table-fixed border-collapse',
              isSelectingCell && 'selection:bg-transparent'
            )}
            {...tableProps}
          >
            <tbody className="min-w-full">{children}</tbody>
          </table>

          {isSelectingTable && (
            <div className={blockSelectionVariants()} contentEditable={false} />
          )}
        </div>
      </PlateElement>
    )

    if (readOnly) {
      return content
    }

    return <TableFloatingToolbar>{content}</TableFloatingToolbar>
  }
)

function TableFloatingToolbar({
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const { tf } = useEditorPlugin(TablePlugin)
  const selected = useSelected()
  const element = useElement<TTableElement>()
  const { props: buttonProps } = useRemoveNodeButton({ element })
  const collapsedInside = useEditorSelector(
    (editor) => selected && editor.api.isCollapsed(),
    [selected]
  )
  const isFocusedLast = useFocusedLast()

  const { canMerge, canSplit } = useTableMergeState()

  return (
    <Popover
      open={isFocusedLast && (canMerge || canSplit || collapsedInside)}
      modal={false}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        asChild
        onOpenAutoFocus={(e) => e.preventDefault()}
        contentEditable={false}
        {...props}
      >
        <Toolbar
          className="scrollbar-hide flex w-auto max-w-[80vw] flex-row overflow-x-auto rounded-md border bg-popover p-1 shadow-md print:hidden"
          contentEditable={false}
        >
          <ToolbarGroup>
            {/* <ColorDropdownMenu tooltip="Background color">
              <PaintBucketIcon />
            </ColorDropdownMenu> */}
            {canMerge && (
              <ToolbarButton
                onClick={() => tf.table.merge()}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Merge cells"
              >
                <CombineIcon />
              </ToolbarButton>
            )}
            {canSplit && (
              <ToolbarButton
                onClick={() => tf.table.split()}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Split cell"
              >
                <SquareSplitHorizontalIcon />
              </ToolbarButton>
            )}

            {/* <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ToolbarButton tooltip="Cell borders">
                  <Grid2X2Icon />
                </ToolbarButton>
              </DropdownMenuTrigger>

              <DropdownMenuPortal>
                <TableBordersDropdownMenuContent />
              </DropdownMenuPortal>
            </DropdownMenu> */}

            {collapsedInside && (
              <ToolbarGroup>
                <ToolbarButton tooltip="Delete table" {...buttonProps}>
                  <Trash2Icon />
                </ToolbarButton>
              </ToolbarGroup>
            )}
          </ToolbarGroup>

          {collapsedInside && (
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableRow({ before: true })
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert row before"
              >
                <ArrowUp />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableRow()
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert row after"
              >
                <ArrowDown />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.remove.tableRow()
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Delete row"
              >
                <XIcon />
              </ToolbarButton>
            </ToolbarGroup>
          )}

          {collapsedInside && (
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableColumn({ before: true })
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert column before"
              >
                <ArrowLeft />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableColumn()
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert column after"
              >
                <ArrowRight />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.remove.tableColumn()
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Delete column"
              >
                <XIcon />
              </ToolbarButton>
            </ToolbarGroup>
          )}
        </Toolbar>
      </PopoverContent>
    </Popover>
  )
}

export function TableRowElement(props: PlateElementProps<TTableRowElement>) {
  const selected = useSelected()

  return (
    <PlateElement
      {...props}
      as="tr"
      className={cn('group/row')}
      attributes={{
        ...props.attributes,
        'data-selected': selected ? 'true' : undefined,
      }}
    >
      {props.children}
    </PlateElement>
  )
}

export function TableCellElement({
  isHeader,
  ...props
}: PlateElementProps<TTableCellElement> & {
  isHeader?: boolean
}) {
  const { api } = useEditorPlugin(TablePlugin)
  const readOnly = useReadOnly()
  const element = props.element

  const tableId = useElementSelector(([node]) => node.id as string, [], {
    key: KEYS.table,
  })
  const rowId = useElementSelector(([node]) => node.id as string, [], {
    key: KEYS.tr,
  })
  const isSelectingTable = useBlockSelected(tableId)
  const isSelectingRow = useBlockSelected(rowId) || isSelectingTable
  const isSelectionAreaVisible = usePluginOption(
    BlockSelectionPlugin,
    'isSelectionAreaVisible'
  )

  const { borders, colIndex, colSpan, minHeight, rowIndex, selected, width } =
    useTableCellElement()

  const { bottomProps, hiddenLeft, leftProps, rightProps } =
    useTableCellElementResizable({
      colIndex,
      colSpan,
      rowIndex,
    })

  return (
    <PlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      className={cn(
        'h-full overflow-visible border-none bg-background p-0',
        element.background ? 'bg-(--cellBackground)' : 'bg-background',
        isHeader && 'text-left *:m-0',
        'before:size-full',
        selected && 'before:z-10 before:bg-brand/5',
        "before:absolute before:box-border before:content-[''] before:select-none",
        borders.bottom?.size && 'before:border-b before:border-b-border',
        borders.right?.size && 'before:border-r before:border-r-border',
        borders.left?.size && 'before:border-l before:border-l-border',
        borders.top?.size && 'before:border-t before:border-t-border'
      )}
      style={
        {
          '--cellBackground': element.background,
          maxWidth: width || 240,
          minWidth: width || 120,
        } as React.CSSProperties
      }
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(element),
        rowSpan: api.table.getRowSpan(element),
      }}
    >
      <div
        className="relative z-20 box-border h-full px-3 py-2"
        style={{ minHeight }}
      >
        {props.children}
      </div>

      {!isSelectionAreaVisible && (
        <div
          className="group absolute top-0 size-full select-none"
          contentEditable={false}
          suppressContentEditableWarning={true}
        >
          {!readOnly && (
            <>
              <ResizeHandle
                {...rightProps}
                className="-top-2 -right-1 h-[calc(100%_+_8px)] w-2"
                data-col={colIndex}
              />
              <ResizeHandle {...bottomProps} className="-bottom-1 h-2" />
              {!hiddenLeft && (
                <ResizeHandle
                  {...leftProps}
                  className="top-0 -left-1 w-2"
                  data-resizer-left={colIndex === 0 ? 'true' : undefined}
                />
              )}

              <div
                className={cn(
                  'absolute top-0 z-30 hidden h-full w-1 bg-ring',
                  'right-[-1.5px]',
                  columnResizeVariants({ colIndex: colIndex as any })
                )}
              />
              {colIndex === 0 && (
                <div
                  className={cn(
                    'absolute top-0 z-30 h-full w-1 bg-ring',
                    'left-[-1.5px]',
                    'hidden animate-in fade-in group-has-[[data-resizer-left]:hover]/table:block group-has-[[data-resizer-left][data-resizing="true"]]/table:block'
                  )}
                />
              )}
            </>
          )}
        </div>
      )}

      {isSelectingRow && (
        <div className={blockSelectionVariants()} contentEditable={false} />
      )}
    </PlateElement>
  )
}

export function TableCellHeaderElement(
  props: React.ComponentProps<typeof TableCellElement>
) {
  return <TableCellElement {...props} isHeader />
}

const columnResizeVariants = cva('hidden animate-in fade-in', {
  variants: {
    colIndex: {
      0: 'group-has-[[data-col="0"]:hover]/table:block group-has-[[data-col="0"][data-resizing="true"]]/table:block',
      1: 'group-has-[[data-col="1"]:hover]/table:block group-has-[[data-col="1"][data-resizing="true"]]/table:block',
      2: 'group-has-[[data-col="2"]:hover]/table:block group-has-[[data-col="2"][data-resizing="true"]]/table:block',
      3: 'group-has-[[data-col="3"]:hover]/table:block group-has-[[data-col="3"][data-resizing="true"]]/table:block',
      4: 'group-has-[[data-col="4"]:hover]/table:block group-has-[[data-col="4"][data-resizing="true"]]/table:block',
      5: 'group-has-[[data-col="5"]:hover]/table:block group-has-[[data-col="5"][data-resizing="true"]]/table:block',
      6: 'group-has-[[data-col="6"]:hover]/table:block group-has-[[data-col="6"][data-resizing="true"]]/table:block',
      7: 'group-has-[[data-col="7"]:hover]/table:block group-has-[[data-col="7"][data-resizing="true"]]/table:block',
      8: 'group-has-[[data-col="8"]:hover]/table:block group-has-[[data-col="8"][data-resizing="true"]]/table:block',
      9: 'group-has-[[data-col="9"]:hover]/table:block group-has-[[data-col="9"][data-resizing="true"]]/table:block',
      10: 'group-has-[[data-col="10"]:hover]/table:block group-has-[[data-col="10"][data-resizing="true"]]/table:block',
    },
  },
})
