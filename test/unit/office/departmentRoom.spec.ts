import { resolveDepartmentRoomId } from "../../../client/src/features/office/utils/departmentRoom";
import type { OrgTreeNode } from "../../../client/src/features/office/types";

const tree: OrgTreeNode[] = [
  {
    id: "dept-a",
    parentId: null,
    type: "department",
    name: "产品部",
    agentId: null,
    order: 0,
    children: [
      {
        id: "slot-1",
        parentId: "dept-a",
        type: "agent",
        name: "Slot",
        agentId: "agent-1",
        order: 0,
        children: [],
      },
    ],
  },
];

describe("resolveDepartmentRoomId", () => {
  it("returns department room when org node maps to department", () => {
    const roomId = resolveDepartmentRoomId("slot-1", tree, [
      { id: "room-dept", organizationNodeId: "dept-a", roomType: "department" },
      { id: "room-main", organizationNodeId: null, roomType: "main" },
    ]);
    expect(roomId).toBe("room-dept");
  });

  it("returns null when no matching department room", () => {
    expect(resolveDepartmentRoomId("slot-1", tree, [])).toBeNull();
    expect(
      resolveDepartmentRoomId("slot-1", tree, [
        { id: "room-other", organizationNodeId: "other-dept", roomType: "department" },
      ]),
    ).toBeNull();
  });

  it("returns null without organization node id", () => {
    expect(resolveDepartmentRoomId(null, tree, [{ id: "r1", organizationNodeId: "dept-a" }])).toBeNull();
  });
});
