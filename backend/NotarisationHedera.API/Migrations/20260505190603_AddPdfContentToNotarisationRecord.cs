using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NotarisationHedera.API.Migrations
{
    /// <inheritdoc />
    public partial class AddPdfContentToNotarisationRecord : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "PdfContent",
                table: "NotarisationRecords",
                type: "longblob",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PdfContent",
                table: "NotarisationRecords");
        }
    }
}
