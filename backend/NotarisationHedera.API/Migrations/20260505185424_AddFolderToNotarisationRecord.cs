using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NotarisationHedera.API.Migrations
{
    /// <inheritdoc />
    public partial class AddFolderToNotarisationRecord : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Folder",
                table: "NotarisationRecords",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Folder",
                table: "NotarisationRecords");
        }
    }
}
